use crate::types::{TrustQuery, TrustResponse, TrustScore};
use async_trait::async_trait;
use futures::io::{AsyncRead, AsyncWrite};
use libp2p::request_response::Codec;
use serde::{Deserialize, Serialize};
use std::io;

#[derive(Debug, Clone)]
pub struct TrustProtocol;

impl AsRef<str> for TrustProtocol {
    fn as_ref(&self) -> &str {
        "/repeer/trust/1.0.0"
    }
}

#[derive(Debug, Clone, Default)]
pub struct TrustCodec;

#[async_trait]
impl Codec for TrustCodec {
    type Protocol = TrustProtocol;
    type Request = TrustQuery;
    type Response = TrustResponse;

    async fn read_request<T>(&mut self, _: &TrustProtocol, io: &mut T) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        let vec = read_length_prefixed(io, 1_000_000).await?;
        serde_json::from_slice(&vec).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    async fn read_response<T>(&mut self, _: &TrustProtocol, io: &mut T) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        let vec = read_length_prefixed(io, 10_000_000).await?;
        serde_json::from_slice(&vec).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    async fn write_request<T>(&mut self, _: &TrustProtocol, io: &mut T, req: Self::Request) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let data = serde_json::to_vec(&req).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        write_length_prefixed(io, data).await
    }

    async fn write_response<T>(&mut self, _: &TrustProtocol, io: &mut T, res: Self::Response) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let data = serde_json::to_vec(&res).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        write_length_prefixed(io, data).await
    }
}

async fn read_length_prefixed<T>(io: &mut T, max_len: usize) -> io::Result<Vec<u8>>
where
    T: AsyncRead + Unpin + Send,
{
    use futures::AsyncReadExt;
    
    let mut len_bytes = [0u8; 4];
    io.read_exact(&mut len_bytes).await?;
    let len = u32::from_be_bytes(len_bytes) as usize;
    
    if len > max_len {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Message too large"));
    }
    
    let mut buf = vec![0u8; len];
    io.read_exact(&mut buf).await?;
    Ok(buf)
}

async fn write_length_prefixed<T>(io: &mut T, data: Vec<u8>) -> io::Result<()>
where
    T: AsyncWrite + Unpin + Send,
{
    use futures::AsyncWriteExt;
    
    let len = data.len() as u32;
    io.write_all(&len.to_be_bytes()).await?;
    io.write_all(&data).await?;
    io.flush().await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustQueryInternal {
    pub query: TrustQuery,
    pub remaining_depth: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustResponseInternal {
    pub response: TrustResponse,
    pub peer_id: String,
}

pub fn merge_responses(responses: Vec<TrustResponseInternal>) -> TrustResponse {
    use chrono::Utc;
    use std::collections::HashMap;
    
    let mut merged_scores: HashMap<(String, String), Vec<(String, TrustScore)>> = HashMap::new();
    
    for resp in responses {
        for agent_score in resp.response.scores {
            merged_scores
                .entry((agent_score.id_domain.clone(), agent_score.agent_id.clone()))
                .or_default()
                .push((resp.peer_id.clone(), agent_score.score));
        }
    }
    
    let final_scores: Vec<crate::types::AgentScore> = merged_scores
        .into_iter()
        .map(|((id_domain, agent_id), scores)| {
            let total_weight: f64 = scores.iter().map(|(_, s)| s.total_volume).sum();
            let weighted_roi: f64 = scores
                .iter()
                .map(|(_, s)| s.expected_pv_roi * s.total_volume)
                .sum::<f64>()
                / total_weight.max(1.0);
            let data_points: usize = scores.iter().map(|(_, s)| s.data_points).sum();
            
            crate::types::AgentScore::new(
                id_domain,
                agent_id,
                TrustScore {
                    expected_pv_roi: weighted_roi,
                    total_volume: total_weight,
                    data_points,
                }
            )
        })
        .collect();
    
    TrustResponse {
        scores: final_scores,
        timestamp: Utc::now(),
    }
}