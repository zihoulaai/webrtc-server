class WebRTCClient {
  constructor() {
    this.ws = null;
    this.peerConnection = null;
    this.localStream = null;
    this.peerId = null;
    this.peerList = [];
    this.targetPeerId = null;

    // DOM 元素
    this.localVideo = document.getElementById('local-video');
    this.remoteVideo = document.getElementById('remote-video');
    this.startCallBtn = document.getElementById('start-call');
    this.endCallBtn = document.getElementById('end-call');
    this.targetPeerSelect = document.getElementById('target-peer');
    this.statusSpan = document.getElementById('status');
    this.peerIdSpan = document.getElementById('peer-id');
    this.localIpSpan = document.getElementById('local-ip');
    this.iceStateSpan = document.getElementById('ice-state');
    this.signalStateSpan = document.getElementById('signal-state');
    this.clientsListDiv = document.getElementById('clients-list');
    this.refreshClientsBtn = document.getElementById('refresh-clients');

    // 事件绑定
    this.startCallBtn.addEventListener('click', () => this.startCall());
    this.endCallBtn.addEventListener('click', () => this.endCall());
    this.refreshClientsBtn.addEventListener('click', () => this.requestClientList());
    this.targetPeerSelect.addEventListener('change', (e) => {
      this.targetPeerId = e.target.value;
      this.startCallBtn.disabled = !this.targetPeerId;
    });

    // 初始化
    this.init();
  }

  async init() {
    await this.initMedia();
    this.initWebSocket();
    this.requestClientList();
  }

  async initMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      this.localVideo.srcObject = this.localStream;
    } catch (err) {
      console.error('Error accessing media devices:', err);
      this.updateStatus('Error: Could not access camera/microphone');
    }
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    this.ws.onopen = () => {
      this.updateStatus('Connected to signaling server');
    };

    this.ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'id') {
        this.peerId = msg.data;
        this.peerIdSpan.textContent = this.peerId;
        this.updateStatus('Ready to connect');
        this.requestClientList();
      }
      else if (msg.type === 'client-list') {
        this.peerList = JSON.parse(msg.data);
        this.updateClientList();
      }
      else if (msg.type === 'offer') {
        await this.handleOffer(msg.data);
      }
      else if (msg.type === 'answer') {
        await this.handleAnswer(msg.data);
      }
      else if (msg.type === 'candidate') {
        await this.handleCandidate(msg.data);
      }
      else if (msg.type === 'error') {
        this.updateStatus(`Error: ${msg.data}`);
      }
    };

    this.ws.onclose = () => {
      this.updateStatus('Disconnected from signaling server');
      setTimeout(() => this.initWebSocket(), 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  updateStatus(text) {
    this.statusSpan.textContent = text;
  }

  requestClientList() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'list-clients' }));
    }
  }

  updateClientList() {
    this.clientsListDiv.innerHTML = '';

    if (this.peerList.length === 0) {
      this.clientsListDiv.innerHTML = '<p>No other clients connected</p>';
      return;
    }

    const list = document.createElement('ul');
    this.peerList.forEach(client => {
      if (client.id !== this.peerId) {
        const item = document.createElement('li');
        item.textContent = client.id;
        list.appendChild(item);
      }
    });
    this.clientsListDiv.appendChild(list);

    // 更新下拉选择框
    this.targetPeerSelect.innerHTML = '<option value="">Select a peer</option>';
    this.peerList.forEach(client => {
      if (client.id !== this.peerId) {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.id;
        this.targetPeerSelect.appendChild(option);
      }
    });
  }

  createPeerConnection() {
    const config = {
      iceServers: [
        {
          urls: `stun:${window.location.hostname}:3478`
        },
        {
          urls: `turn:${window.location.hostname}:3478`,
          username: "user",
          credential: "password"
        }
      ]
    };

    this.peerConnection = new RTCPeerConnection(config);

    // 添加本地流
    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    // ICE候选处理
    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'candidate',
          to: this.targetPeerId,
          data: JSON.stringify(event.candidate)
        }));
      }
    };

    // 远程流处理
    this.peerConnection.ontrack = event => {
      this.remoteVideo.srcObject = event.streams[0];
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      this.iceStateSpan.textContent = this.peerConnection.iceConnectionState;
      if (this.peerConnection.iceConnectionState === 'disconnected') {
        this.endCall();
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', this.peerConnection.iceGatheringState);
    };

    this.peerConnection.onsignalingstatechange = () => {
      this.signalStateSpan.textContent = this.peerConnection.signalingState;
    };
  }

  async startCall() {
    if (!this.targetPeerId) return;

    this.createPeerConnection();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.ws.send(JSON.stringify({
      type: 'offer',
      to: this.targetPeerId,
      data: JSON.stringify(offer)
    }));

    this.startCallBtn.disabled = true;
    this.endCallBtn.disabled = false;
    this.targetPeerSelect.disabled = true;
    this.updateStatus(`Calling ${this.targetPeerId}...`);
  }

  endCall() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.remoteVideo.srcObject) {
      this.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      this.remoteVideo.srcObject = null;
    }

    this.startCallBtn.disabled = false;
    this.endCallBtn.disabled = true;
    this.targetPeerSelect.disabled = false;
    this.updateStatus('Call ended');
  }

  async handleOffer(offerData) {
    const offer = JSON.parse(offerData);

    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.ws.send(JSON.stringify({
      type: 'answer',
      to: this.targetPeerId,
      data: JSON.stringify(answer)
    }));

    this.startCallBtn.disabled = true;
    this.endCallBtn.disabled = false;
    this.targetPeerSelect.disabled = true;
    this.updateStatus(`In call with ${this.targetPeerId}`);
  }

  async handleAnswer(answerData) {
    const answer = JSON.parse(answerData);
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleCandidate(candidateData) {
    const candidate = JSON.parse(candidateData);
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding ICE candidate:', e);
    }
  }
}

// 初始化客户端
document.addEventListener('DOMContentLoaded', () => {
  new WebRTCClient();
});
