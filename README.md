# WebRTC Server

轻量级WebRTC服务器，使用Go语言和Pion库实现，支持信令交换和STUN/TURN服务。

## 功能特性

- 基于WebSocket的信令服务器
- STUN/TURN服务器实现NAT穿透
- 客户端发现和管理
- 点对点视频通话
- 响应式前端界面

## 技术栈

- **后端**: Go, Pion WebRTC, Gorilla WebSocket
- **前端**: HTML5, CSS3, JavaScript (WebRTC API)
- **网络协议**: WebSocket, STUN, TURN, ICE

## 快速开始

### 本地运行

1. 安装Go 1.19+
2. 克隆仓库:
   ```bash
   git clone https://github.com/zihoulaai/webrtc-server.git
   cd webrtc-server
