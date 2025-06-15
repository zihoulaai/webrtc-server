class WebRTCClient {
  constructor() {
    // DOM 元素
    this.localVideo = document.getElementById('local-video');
    this.remoteVideo = document.getElementById('remote-video');
    this.startCallBtn = document.getElementById('start-call');
    this.endCallBtn = document.getElementById('end-call');
    this.toggleCameraBtn = document.getElementById('toggle-camera');
    this.toggleMicBtn = document.getElementById('toggle-mic');
    this.targetPeerSelect = document.getElementById('target-peer');
    this.statusSpan = document.getElementById('status');
    this.peerIdSpan = document.getElementById('peer-id');
    this.iceStateSpan = document.getElementById('ice-state');
    this.localTracksSpan = document.getElementById('local-tracks');
    this.remoteTracksSpan = document.getElementById('remote-tracks');
    this.connectionStateSpan = document.getElementById('connection-state');
    this.clientsListDiv = document.getElementById('clients-list');
    this.videoDeviceSelect = document.getElementById('video-device');
    this.audioDeviceSelect = document.getElementById('audio-device');
    this.refreshDevicesBtn = document.getElementById('refresh-devices');
    this.permissionPrompt = document.getElementById('permission-prompt');
    this.requestPermissionBtn = document.getElementById('request-permission');
    this.screenShareBtn = document.getElementById('screen-share');

    // 状态变量
    this.ws = null;
    this.peerConnection = null;
    this.localStream = null;
    this.peerId = null;
    this.peerList = [];
    this.targetPeerId = null;
    this.heartbeatInterval = null;
    this.isCameraActive = true;
    this.isMicActive = true;

    // 事件监听
    this.startCallBtn.addEventListener('click', () => this.startCall());
    this.endCallBtn.addEventListener('click', () => this.endCall());
    this.toggleCameraBtn.addEventListener('click', () => this.toggleCamera());
    this.toggleMicBtn.addEventListener('click', () => this.toggleMicrophone());
    this.refreshDevicesBtn.addEventListener('click', () => this.getMediaDevices());
    this.requestPermissionBtn.addEventListener('click', () => this.requestMediaAccess());
    this.screenShareBtn.addEventListener('click', () => this.startScreenShare());

    // 初始化
    this.init();
  }

  async init() {
    if (!this.checkBrowserSupport()) {
      this.showUnsupportedMessage();
      return;
    }

    await this.checkPermissions();
    await this.getMediaDevices();
    await this.initMedia();
    this.initWebSocket();
    this.requestClientList();
  }

  checkBrowserSupport() {
    const requiredFeatures = [
      'mediaDevices' in navigator,
      'getUserMedia' in navigator.mediaDevices,
      'RTCPeerConnection' in window
    ];

    return requiredFeatures.every(Boolean);
  }

  showUnsupportedMessage() {
    const container = document.querySelector('.container');
    container.innerHTML = `
            <div class="unsupported-message">
                <h2>Browser Not Supported</h2>
                <p>Your browser does not support all required features for this application.</p>
                <p>Please use one of the following browsers:</p>
                <ul>
                    <li>Google Chrome (latest version)</li>
                    <li>Mozilla Firefox (latest version)</li>
                    <li>Microsoft Edge (Chromium-based, latest version)</li>
                </ul>
                <p>Mobile browsers are supported on Android (Chrome/Firefox) and iOS 14.3+ (Safari).</p>
            </div>
        `;
  }

  async checkPermissions() {
    try {
      // 检查摄像头权限
      const cameraStatus = await navigator.permissions.query({ name: 'camera' });
      console.log('Camera permission:', cameraStatus.state);

      // 检查麦克风权限
      const micStatus = await navigator.permissions.query({ name: 'microphone' });
      console.log('Microphone permission:', micStatus.state);

      // 如果没有授权，显示提示
      if (cameraStatus.state !== 'granted' || micStatus.state !== 'granted') {
        this.permissionPrompt.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Permission check failed:', err);
    }
  }

  showPermissionPrompt() {
    this.permissionPrompt.classList.remove('hidden');
  }

  hidePermissionPrompt() {
    this.permissionPrompt.classList.add('hidden');
  }

  async requestMediaAccess() {
    try {
      // 尝试获取媒体设备以触发权限请求
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      stream.getTracks().forEach(track => track.stop());
      console.log('Media access granted');
      this.hidePermissionPrompt();
      this.getMediaDevices();
    } catch (err) {
      console.error('Failed to request media access:', err);
      this.updateStatus('Please allow camera and microphone access in your browser settings.');
    }
  }

  async getMediaDevices() {
    try {
      // 获取可用设备
      const devices = await navigator.mediaDevices.enumerateDevices();

      // 清空选择框
      this.videoDeviceSelect.innerHTML = '';
      this.audioDeviceSelect.innerHTML = '';

      // 添加默认选项
      const videoDefault = document.createElement('option');
      videoDefault.value = '';
      videoDefault.textContent = 'Default Camera';
      this.videoDeviceSelect.appendChild(videoDefault);

      const audioDefault = document.createElement('option');
      audioDefault.value = '';
      audioDefault.textContent = 'Default Microphone';
      this.audioDeviceSelect.appendChild(audioDefault);

      // 填充设备列表
      devices.forEach(device => {
        if (device.kind === 'videoinput') {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || `Camera ${this.videoDeviceSelect.length}`;
          this.videoDeviceSelect.appendChild(option);
        } else if (device.kind === 'audioinput') {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || `Microphone ${this.audioDeviceSelect.length}`;
          this.audioDeviceSelect.appendChild(option);
        }
      });
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }

  async initMedia() {
    // 获取选定的设备
    const videoDevice = this.videoDeviceSelect.value;
    const audioDevice = this.audioDeviceSelect.value;

    const constraints = {
      video: videoDevice ? {
        deviceId: { exact: videoDevice },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } : {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: audioDevice ? {
        deviceId: { exact: audioDevice }
      } : true
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localVideo.srcObject = this.localStream;
      this.updateTrackCount();
      console.log('Obtained media stream with constraints:', constraints);
      this.hidePermissionPrompt();
    } catch (err) {
      console.error('Error accessing media:', err);
      this.showPermissionPrompt();
      this.handleMediaError(err);
    }
  }

  handleMediaError(err) {
    console.error('Media error:', err);

    // 友好的错误提示
    let message = 'Failed to access camera/microphone. ';

    switch(err.name) {
      case 'NotAllowedError':
        message += 'Please allow access in your browser settings.';
        break;
      case 'NotFoundError':
        message += 'No media devices found.';
        break;
      case 'NotReadableError':
        message += 'Device is already in use by another application.';
        break;
      case 'OverconstrainedError':
        message += 'Requested settings not supported by your device.';
        break;
      default:
        message += `Error: ${err.message}`;
    }

    this.updateStatus(message);
  }

  async startScreenShare() {
    try {
      // 停止现有媒体流
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }

      // 获取屏幕共享
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "monitor"
        },
        audio: true
      });

      // 监听停止共享事件
      this.localStream.getVideoTracks()[0].onended = () => {
        this.updateStatus('Screen sharing stopped');
        this.initMedia(); // 尝试重新获取摄像头
      };

      this.localVideo.srcObject = this.localStream;
      this.updateTrackCount();
      this.hidePermissionPrompt();

      // 如果正在通话中，替换轨道
      if (this.peerConnection) {
        const videoSender = this.peerConnection.getSenders().find(
          s => s.track && s.track.kind === 'video'
        );

        if (videoSender) {
          await videoSender.replaceTrack(
            this.localStream.getVideoTracks()[0]
          );
        }
      }
    } catch (err) {
      console.error('Screen sharing failed:', err);
      this.updateStatus('Screen sharing not supported or permission denied.');
    }
  }

  updateTrackCount() {
    if (this.localStream) {
      this.localTracksSpan.textContent = this.localStream.getTracks().length;
    } else {
      this.localTracksSpan.textContent = '0';
    }

    if (this.remoteVideo.srcObject) {
      this.remoteTracksSpan.textContent = this.remoteVideo.srcObject.getTracks().length;
    } else {
      this.remoteTracksSpan.textContent = '0';
    }
  }

  toggleCamera() {
    if (!this.localStream) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      this.isCameraActive = !this.isCameraActive;
      videoTrack.enabled = this.isCameraActive;
      this.toggleCameraBtn.textContent = this.isCameraActive ?
        'Disable Camera' : 'Enable Camera';
    }
  }

  toggleMicrophone() {
    if (!this.localStream) return;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.isMicActive = !this.isMicActive;
      audioTrack.enabled = this.isMicActive;
      this.toggleMicBtn.textContent = this.isMicActive ?
        'Mute Microphone' : 'Unmute Microphone';
    }
  }

  initWebSocket() {
    // 根据协议确定 WebSocket URL
    const isSecure = window.location.protocol === 'https:';
    const wsProtocol = isSecure ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

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
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      setTimeout(() => this.initWebSocket(), 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // 添加心跳
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
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

    if (this.targetPeerSelect.options.length > 1) {
      this.startCallBtn.disabled = false;
    }
  }

  createPeerConnection() {
    const isRemote = !window.location.hostname.match(/(localhost|127\.0\.0\.1)/);
    const serverHost = isRemote ? window.location.hostname : 'localhost';

    const config = {
      iceServers: [
        {
          urls: `stun:${serverHost}:3478`
        },
        {
          urls: [
            `turn:${serverHost}:3478?transport=udp`,
            `turn:${serverHost}:3478?transport=tcp`
          ],
          username: "user",
          credential: "password"
        },
        // 公共备用服务器
        {
          urls: "stun:stun.l.google.com:19302"
        },
        {
          urls: "stun:stun1.l.google.com:19302"
        }
      ],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require"
    };

    this.peerConnection = new RTCPeerConnection(config);

    // 添加本地流
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        console.log("Adding local track:", track.kind);
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // ICE候选处理
    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        console.log("ICE Candidate:", event.candidate);
        this.ws.send(JSON.stringify({
          type: 'candidate',
          to: this.targetPeerId,
          data: JSON.stringify(event.candidate)
        }));
      } else {
        console.log("ICE Gathering Complete");
      }
    };

    // 远程流处理
    this.peerConnection.ontrack = event => {
      console.log("Received remote track:", event.track.kind);

      if (!this.remoteVideo.srcObject) {
        this.remoteVideo.srcObject = new MediaStream();
      }

      this.remoteVideo.srcObject.addTrack(event.track);
      this.updateTrackCount();
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", this.peerConnection.iceConnectionState);
      this.iceStateSpan.textContent = this.peerConnection.iceConnectionState;

      if (this.peerConnection.iceConnectionState === 'disconnected') {
        this.endCall();
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
      console.log("ICE Gathering State:", this.peerConnection.iceGatheringState);
    };

    this.peerConnection.onsignalingstatechange = () => {
      console.log("Signaling State:", this.peerConnection.signalingState);
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log("Connection State:", this.peerConnection.connectionState);
      this.connectionStateSpan.textContent = this.peerConnection.connectionState;
    };
  }

  async startCall() {
    if (!this.targetPeerId) return;

    // 检查目标对等点是否在线
    if (!this.peerList.some(client => client.id === this.targetPeerId)) {
      this.updateStatus(`Peer ${this.targetPeerId} is offline`);
      return;
    }

    // 创建新的PeerConnection
    this.createPeerConnection();

    try {
      // 创建Offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      console.log("Created offer:", offer);

      // 设置本地描述
      await this.peerConnection.setLocalDescription(offer);

      // 发送Offer
      this.ws.send(JSON.stringify({
        type: 'offer',
        to: this.targetPeerId,
        data: JSON.stringify(offer)
      }));

      // 更新UI
      this.startCallBtn.disabled = true;
      this.endCallBtn.disabled = false;
      this.targetPeerSelect.disabled = true;
      this.updateStatus(`Calling ${this.targetPeerId}...`);

    } catch (err) {
      console.error("Error creating offer:", err);
      this.updateStatus(`Error: ${err.message}`);
    }
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
    this.updateTrackCount();
  }

  async handleOffer(offerData) {
    const offer = JSON.parse(offerData);
    console.log("Received offer:", offer);

    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    try {
      // 设置远端描述
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer));

      // 创建Answer
      const answer = await this.peerConnection.createAnswer();
      console.log("Created answer:", answer);

      // 设置本地描述
      await this.peerConnection.setLocalDescription(answer);

      // 发送Answer
      this.ws.send(JSON.stringify({
        type: 'answer',
        to: this.targetPeerId,
        data: JSON.stringify(answer)
      }));

      // 更新UI
      this.startCallBtn.disabled = true;
      this.endCallBtn.disabled = false;
      this.targetPeerSelect.disabled = true;
      this.updateStatus(`In call with ${this.targetPeerId}`);

    } catch (err) {
      console.error("Error handling offer:", err);
      this.updateStatus(`Error: ${err.message}`);
    }
  }

  async handleAnswer(answerData) {
    const answer = JSON.parse(answerData);
    console.log("Received answer:", answer);
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer));
  }

  async handleCandidate(candidateData) {
    const candidate = JSON.parse(candidateData);
    try {
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding ICE candidate:', e);
    }
  }
}

// 初始化客户端
document.addEventListener('DOMContentLoaded', () => {
  new WebRTCClient();
});
