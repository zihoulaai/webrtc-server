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
    this.init().catch(err => {
      console.error('初始化失败:', err);
      this.updateStatus('初始化失败，请检查控制台日志。');
    });
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
    return (
      'mediaDevices' in navigator &&
      navigator.mediaDevices &&
      'getUserMedia' in navigator.mediaDevices &&
      'RTCPeerConnection' in window
    );
  }

  showUnsupportedMessage() {
    document.querySelector('.container').innerHTML = `
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
      const cameraStatus = await navigator.permissions.query({name: 'camera'});
      const micStatus = await navigator.permissions.query({name: 'microphone'});
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
      const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
      stream.getTracks().forEach(track => track.stop());
      this.hidePermissionPrompt();
      await this.getMediaDevices();
    } catch (err) {
      console.error('Failed to request media access:', err);
      this.updateStatus('Please allow camera and microphone access in your browser settings.');
    }
  }

  async getMediaDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log(devices);

      this.videoDeviceSelect.innerHTML = '';
      this.audioDeviceSelect.innerHTML = '';
      let firstVideoId = '';
      let firstAudioId = '';
      const videoGroupSet = new Set();
      const audioGroupSet = new Set();

      devices.forEach(device => {
        if (device.kind === 'videoinput') {
          if (!device.groupId || !videoGroupSet.has(device.groupId)) {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${this.videoDeviceSelect.length}`;
            this.videoDeviceSelect.appendChild(option);
            if (!firstVideoId) firstVideoId = device.deviceId;
            if (device.groupId) videoGroupSet.add(device.groupId);
          }
        } else if (device.kind === 'audioinput') {
          if (!device.groupId || !audioGroupSet.has(device.groupId)) {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${this.audioDeviceSelect.length}`;
            this.audioDeviceSelect.appendChild(option);
            if (!firstAudioId) firstAudioId = device.deviceId;
            if (device.groupId) audioGroupSet.add(device.groupId);
          }
        }
      });
      if (firstVideoId) this.videoDeviceSelect.value = firstVideoId;
      if (firstAudioId) this.audioDeviceSelect.value = firstAudioId;
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }

  async initMedia() {
    const videoDevice = this.videoDeviceSelect.value;
    const audioDevice = this.audioDeviceSelect.value;
    const constraints = {
      video: videoDevice ? {
        deviceId: {exact: videoDevice},
        width: {ideal: 1280},
        height: {ideal: 720}
      } : {width: {ideal: 1280}, height: {ideal: 720}},
      audio: audioDevice ? {deviceId: {exact: audioDevice}} : true
    };
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localVideo.srcObject = this.localStream;
      this.updateTrackCount();
      this.hidePermissionPrompt();
    } catch (err) {
      console.error('Error accessing media:', err);
      this.showPermissionPrompt();
      this.handleMediaError(err);
    }
  }

  handleMediaError(err) {
    let message = 'Failed to access camera/microphone. ';
    switch (err.name) {
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
      if (this.localStream) this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {cursor: "always", displaySurface: "monitor"},
        audio: true
      });
      this.localStream.getVideoTracks()[0].onended = () => {
        this.updateStatus('Screen sharing stopped');
        this.initMedia();
      };
      this.localVideo.srcObject = this.localStream;
      this.updateTrackCount();
      this.hidePermissionPrompt();
      if (this.peerConnection) {
        const videoSender = this.peerConnection.getSenders().find(
          s => s.track && s.track.kind === 'video'
        );
        if (videoSender) {
          await videoSender.replaceTrack(this.localStream.getVideoTracks()[0]);
        }
      }
    } catch (err) {
      console.error('Screen sharing failed:', err);
      this.updateStatus('Screen sharing not supported or permission denied.');
    }
  }

  updateTrackCount() {
    this.localTracksSpan.textContent = this.localStream ? String(this.localStream.getTracks().length) : '0';
    this.remoteTracksSpan.textContent = this.remoteVideo.srcObject ? String(this.remoteVideo.srcObject.getTracks().length) : '0';
  }

  toggleCamera() {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      this.isCameraActive = !this.isCameraActive;
      videoTrack.enabled = this.isCameraActive;
      this.toggleCameraBtn.textContent = this.isCameraActive ? 'Disable Camera' : 'Enable Camera';
    }
  }

  toggleMicrophone() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.isMicActive = !this.isMicActive;
      audioTrack.enabled = this.isMicActive;
      this.toggleMicBtn.textContent = this.isMicActive ? 'Mute Microphone' : 'Unmute Microphone';
    }
  }

  initWebSocket() {
    const isSecure = window.location.protocol === 'https:';
    const wsProtocol = isSecure ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => this.updateStatus('Connected to signaling server');
    this.ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'id') {
        this.peerId = msg.data;
        this.peerIdSpan.textContent = this.peerId;
        this.updateStatus('Ready to connect');
        this.requestClientList();
      } else if (msg.type === 'client-list') {
        this.peerList = JSON.parse(msg.data);
        this.updateClientList();
      } else if (msg.type === 'offer') {
        await this.handleOffer(msg.data);
      } else if (msg.type === 'answer') {
        await this.handleAnswer(msg.data);
      } else if (msg.type === 'candidate') {
        await this.handleCandidate(msg.data);
      } else if (msg.type === 'error') {
        this.updateStatus(`Error: ${msg.data}`);
      }
    };
    this.ws.onclose = () => {
      this.updateStatus('Disconnected from signaling server');
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      setTimeout(() => this.initWebSocket(), 3000);
    };
    this.ws.onerror = (error) => console.error('WebSocket error:', error);

  }

  updateStatus(text) {
    this.statusSpan.textContent = text;
  }

  requestClientList() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({type: 'list-clients'}));
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
        {urls: `stun:${serverHost}:3478`},
        {
          urls: [`turn:${serverHost}:3478?transport=udp`, `turn:${serverHost}:3478?transport=tcp`],
          username: "user",
          credential: "password"
        },
        {urls: "stun:stun.l.google.com:19302"},
        {urls: "stun:stun1.l.google.com:19302"}
      ],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require"
    };
    this.peerConnection = new RTCPeerConnection(config);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'candidate',
          to: this.targetPeerId,
          data: JSON.stringify(event.candidate)
        }));
      }
    };

    this.peerConnection.ontrack = event => {
      if (!this.remoteVideo.srcObject) {
        this.remoteVideo.srcObject = new MediaStream();
      }
      this.remoteVideo.srcObject.addTrack(event.track);
      this.updateTrackCount();
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      this.iceStateSpan.textContent = this.peerConnection.iceConnectionState;
      if (this.peerConnection.iceConnectionState === 'disconnected') {
        this.endCall();
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
    };
    this.peerConnection.onsignalingstatechange = () => {
    };
    this.peerConnection.onconnectionstatechange = () => {
      this.connectionStateSpan.textContent = this.peerConnection.connectionState;
    };
  }

  async startCall() {
    this.targetPeerId = this.targetPeerSelect.value;
    console.log("Starting call with target peer:", this.targetPeerId);
    if (!this.targetPeerId) {
      this.updateStatus('请选择一个目标对等方');
      return;
    }
    if (!this.peerList.some(client => client.id === this.targetPeerId)) {
      this.updateStatus(`Peer ${this.targetPeerId} 已离线`);
      return;
    }
    this.createPeerConnection();
    try {
      const offer = await this.peerConnection.createOffer({offerToReceiveAudio: true, offerToReceiveVideo: true});
      await this.peerConnection.setLocalDescription(offer);
      this.ws.send(JSON.stringify({
        type: 'offer',
        to: this.targetPeerId,
        data: JSON.stringify(offer)
      }));
      this.startCallBtn.disabled = true;
      this.endCallBtn.disabled = false;
      this.targetPeerSelect.disabled = true;
      this.updateStatus(`正在呼叫 ${this.targetPeerId}...`);
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
    if (!this.peerConnection) this.createPeerConnection();
    try {
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
    } catch (err) {
      console.error("Error handling offer:", err);
      this.updateStatus(`Error: ${err.message}`);
    }
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
