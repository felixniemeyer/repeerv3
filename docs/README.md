# Repeer Documentation

Welcome to the Repeer trust network documentation. This directory contains comprehensive guides for understanding, using, and contributing to the Repeer system.

## 📚 Documentation Overview

### User Guides
- **[Getting Started](getting-started.md)** - Quick setup and first steps
- **[Browser Extension Guide](browser-extension.md)** - Using the extension effectively
- **[Trust Concepts](trust-concepts.md)** - Understanding trust scores and ROI calculations

### Developer Guides  
- **[Adapter Development](adapter-development.md)** - Creating adapters for new platforms
- **[API Reference](api-reference.md)** - Complete API documentation
- **[Node Setup](node-setup.md)** - Running your own trust node

### Architecture
- **[System Architecture](architecture.md)** - High-level system design
- **[Trust Algorithm](trust-algorithm.md)** - Detailed trust calculation methods
- **[P2P Network](p2p-network.md)** - Peer-to-peer networking design

## 🚀 Quick Links

### For Users
- [Install Browser Extension](../browser-extension/README.md)
- [Test with Demo Data](../demo/README.md)
- [View Trust Scores on Websites](browser-extension.md#viewing-trust-scores)

### For Developers
- [Build from Source](../README.md#development)
- [Run Tests](../README.md#testing)
- [Create Custom Adapters](adapter-development.md)

### For Researchers
- [Trust Algorithm Details](trust-algorithm.md)
- [Network Topology](p2p-network.md)
- [Performance Analysis](performance.md)

## 🏗️ Project Structure

```
repeer/
├── trust-node/          # Rust trust calculation node
├── trust-client/        # TypeScript client library  
├── browser-extension/   # Vue.js browser extension
├── demo/               # Demo data and test scenarios
├── docs/               # Documentation (this directory)
└── tests/              # Integration tests
```

## 🔧 Development Workflow

1. **Read Architecture** - Understand the system design
2. **Set up Environment** - Install dependencies and tools
3. **Run Demo** - Generate test data and try the extension
4. **Make Changes** - Develop features or fix bugs
5. **Run Tests** - Ensure everything works correctly
6. **Submit PR** - Contribute back to the project

## 📖 Core Concepts

### Trust Network
A decentralized network where users share experiences about agents (people, products, services) to build collective trust scores.

### Present Value ROI (PV-ROI)
The core trust metric calculated as: `(return_value / investment) * (365 / timeframe_days)`

### Volume Weighting
Trust scores are weighted by transaction volume to give more influence to larger, more significant experiences.

### Transitive Trust
Trust propagates through the network - if you trust Alice and Alice trusts Bob, you have some level of trust in Bob.

### Adapters
Modular components that parse and validate identifiers from different platforms (Ethereum, AliExpress, domains, etc.).

## 🛡️ Security Considerations

- **Local First**: Your trust data stays on your node
- **Encrypted P2P**: All network communication is encrypted
- **No Central Authority**: No single point of failure or control
- **Privacy Preserving**: Share trust signals without revealing personal data

## 🤝 Contributing

We welcome contributions! Please:

1. Read the relevant documentation for your area of interest
2. Check existing issues and discussions
3. Follow the coding standards and patterns
4. Write tests for new functionality
5. Update documentation as needed

## 📞 Support

- **Issues**: Report bugs and feature requests on GitHub
- **Discussions**: Join community discussions
- **Documentation**: Help improve these docs
- **Code**: Submit pull requests

## 📄 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

*Generated as part of the Repeer trust network project. Help us build a more trustworthy internet.*