mod node;
mod protocols;
mod storage;
mod query_engine;
mod types;
mod api;

use clap::Parser;
use std::path::PathBuf;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long, default_value_t = 8080)]
    api_port: u16,

    #[arg(short, long, default_value_t = 0)]
    p2p_port: u16,

    #[arg(short, long)]
    user: String,

    #[arg(short, long, default_value = "./trust_data")]
    data_dir: PathBuf,

    #[arg(long)]
    bootstrap_peers: Vec<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "trust_node=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = Args::parse();
    
    info!("Starting trust node for user: {}", args.user);
    info!("API port: {}, P2P port: {}", args.api_port, args.p2p_port);

    let storage = storage::SqliteStorage::new(&args.data_dir.join(format!("{}.db", args.user))).await?;
    
    let (node, api_handle) = node::TrustNode::new(
        args.p2p_port,
        args.api_port,
        storage,
        args.bootstrap_peers,
    ).await?;

    tokio::select! {
        res = node.run() => {
            if let Err(e) = res {
                eprintln!("Node error: {}", e);
            }
        }
        res = api_handle => {
            if let Err(e) = res {
                eprintln!("API server error: {}", e);
            }
        }
    }

    Ok(())
}