use crate::types::{TrustQuery, TrustResponse};
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
        let request: Self::Request = serde_json::from_slice(&vec).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        tracing::debug!("LIBP2P: Decoded incoming request: {:?}", request);
        Ok(request)
    }

    async fn read_response<T>(&mut self, _: &TrustProtocol, io: &mut T) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        let vec = read_length_prefixed(io, 10_000_000).await?;
        let response: Self::Response = serde_json::from_slice(&vec).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        tracing::debug!("LIBP2P: Decoded incoming response: {} scores", response.scores.len());
        Ok(response)
    }

    async fn write_request<T>(&mut self, _: &TrustProtocol, io: &mut T, req: Self::Request) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        tracing::debug!("LIBP2P: Encoding outgoing request: {:?}", req);
        let data = serde_json::to_vec(&req).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        write_length_prefixed(io, data).await
    }

    async fn write_response<T>(&mut self, _: &TrustProtocol, io: &mut T, res: Self::Response) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        tracing::debug!("LIBP2P: Encoding outgoing response: {} scores", res.scores.len());
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
    use crate::types::TrustScore;
    
    tracing::debug!("merge_responses: Processing {} responses", responses.len());
    
    let mut merged_scores: HashMap<(String, String), Vec<TrustScore>> = HashMap::new();
    
    for resp in responses {
        for agent_score in resp.response.scores {
            merged_scores
                .entry((agent_score.id_domain.clone(), agent_score.agent_id.clone()))
                .or_default()
                .push(agent_score.score);
        }
    }
    
    let final_scores: Vec<crate::types::AgentScore> = merged_scores
        .into_iter()
        .map(|((id_domain, agent_id), scores)| {
            // Use the new TrustScore merge functionality
            // All peer responses get equal weight (1.0) since this is just combining responses
            let score_weight_pairs: Vec<(TrustScore, f64)> = scores
                .into_iter()
                .map(|score| (score, 1.0))
                .collect();
            
            let merged_score = TrustScore::merge_multiple(score_weight_pairs);
            
            crate::types::AgentScore::new(id_domain, agent_id, merged_score)
        })
        .collect();
    
    TrustResponse {
        scores: final_scores,
        timestamp: Utc::now(),
    }
}