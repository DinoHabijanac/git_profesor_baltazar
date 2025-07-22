import { Camera } from '@mediapipe/camera_utils';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import Utils from './Utils';
import BaseScene from './BaseScene';

export default class InputManager {
  constructor({ videoElement }) {
    this.video = videoElement;
    this.handlers = { move: [], click: [], frameCount: [] };
    this.lastVideoTime = -1;
    this.lastGestures = {};

    this.running = false;
    this.frameInterval = 1000 / 30;
    this.nextDetectionTime = 0;
    this._visibilityHandler = this._handleVisibilityChange.bind(this);

    this.cameraAvailable = false;
    this.pointerDown = false;
    this._pointerMove = null;
    this._pointerDownHandler = null;
    this._pointerUpHandler = null;

    this.lastClickTime = {};
    this.clickCooldown = 300; 
    this._frameCount = 0;

    this.handPredictions = new Map();
    this.predictionTimeout = 250;
    this.lastPredictionUpdate = new Map();
    this.nextHandId = 0;
  }

  async init() {
    const wasmFileset = await FilesetResolver.forVisionTasks('/wasm');

    const gestureOptions = {
      baseOptions: { 
        modelAssetPath: '/wasm/gesture_recognizer.task',
        delegate: "GPU"
      },
      runningMode: 'VIDEO',
      numHands: 3,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6
    };
    this.gestureRecognizer = await GestureRecognizer.createFromOptions(wasmFileset, gestureOptions);

    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      this.cameraAvailable = devices?.some(d => d.kind === 'videoinput');
    } catch (e) {
      this.cameraAvailable = false;
    }

    if (this.cameraAvailable) {
      this.camera = new Camera(this.video, {
        onFrame: async () => {},
        width: 640,
        height: 360
      });
    }

    document.addEventListener('visibilitychange', this._visibilityHandler);
    this.start();
  }

   start() {
    if (this.running) return;
    this.running = true;
    this.lastClickTime = {};
    this._frameCount = 0;
    if (this.cameraAvailable) {
      this.camera.start();
      this.nextDetectionTime = performance.now();
      requestAnimationFrame(this._detectionLoop);
    } else {
      this._enablePointerControls();
      this.nextDetectionTime = performance.now();
      requestAnimationFrame(this._pointerLoop.bind(this));
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.cameraAvailable) {
      this.camera.stop();
    } else {
      this._disablePointerControls();
    }
  }

  _handleVisibilityChange() {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  }

  _detectionLoop = async () => {
    if (!this.running || !this.video || !this.gestureRecognizer) return;
    if (!this.video.videoWidth || !this.video.videoHeight) {
      return requestAnimationFrame(this._detectionLoop);
    }

    const now = performance.now();
    const start = now;
    this._frameCount = 0;
    if (this._frameCount !== 0 || now < this.nextDetectionTime) {
      return requestAnimationFrame(this._detectionLoop);
    }

    this.nextDetectionTime = now + this.frameInterval;
    let emitted = false;

    try {
      const results = this.gestureRecognizer.recognizeForVideo(this.video, now);

      const detections = [];
      if (results.gestures?.length) {
        for (let i = 0; i < results.gestures.length; i++) {
          const landmarks = results.landmarks[i];
          if (landmarks && landmarks[8]) {
            const x = Utils.xCameraCoordinate(landmarks[8].x);
            const y = Utils.yCameraCoordinate(landmarks[8].y);
            const gesture = results.gestures[i][0].categoryName;
            const thickness = Math.sqrt(
              (landmarks[5].x - landmarks[0].x) ** 2 +
              (landmarks[5].y - landmarks[0].y) ** 2 +
              (landmarks[5].z - landmarks[0].z) ** 2
            );
            detections.push({ x, y, gesture, thickness });
          }
        }
      }

      const usedIds = new Set();
      detections.forEach(det => {
        let bestId = null;
        let bestDist = Infinity;
        this.handPredictions.forEach((pred, id) => {
          if (usedIds.has(id)) return;
          const dist = Math.hypot(pred.x - det.x, pred.y - det.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestId = id;
          }
        });

        if (bestId !== null && bestDist < 0.15) {
          det.id = bestId;
        } else {
          det.id = this.nextHandId++;
        }

        usedIds.add(det.id);
        this.handPredictions.set(det.id, { x: det.x, y: det.y, i: det.id, gesture: det.gesture, thickness: det.thickness });
        this.lastPredictionUpdate.set(det.id, now);

        this.emit('move', { x: det.x, y: det.y, i: det.id, gesture: det.gesture, thickness: det.thickness });

        const nowClick = performance.now();
        const lastClick = this.lastClickTime[det.id] || 0;
        if (
          det.gesture === "Pointing_Up" &&
          this.lastGestures[det.id] !== "Pointing_Up" &&
          nowClick - lastClick > this.clickCooldown
        ) {
          this.emit('click', { x: det.x, y: det.y });
          this.lastClickTime[det.id] = nowClick;
        }

        this.lastGestures[det.id] = det.gesture;
      });

      this.handPredictions.forEach((pred, id) => {
        if (usedIds.has(id)) return;
        if (now - (this.lastPredictionUpdate.get(id) || 0) > this.predictionTimeout) {
          this.handPredictions.delete(id);
          this.lastPredictionUpdate.delete(id);
          delete this.lastGestures[id];
          delete this.lastClickTime[id];
          return;
        }
        this.emit('move', { x: pred.x, y: pred.y, i: id, gesture: pred.gesture, thickness: pred.thickness });
      });

      this.emit('frameCount');
    } catch (err) {
      console.error("Gesture recognition error:", err);
    }

    const end = performance.now();
    const duration = end - start;

    const delay = Math.max(0, 16 - duration);

    setTimeout(() => requestAnimationFrame(this._detectionLoop), delay);
  }

  _enablePointerControls() {
    if (this._pointerMove) return;
    this._pointerMove = e => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      const gesture = this.pointerDown ? 'Pointing_Up' : 'Open_Palm';
      this.emit('move', { x, y, i: 0, gesture, thickness: 1 });
    };
    this._pointerDownHandler = e => {
      this.pointerDown = true;
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      this.emit('click', { x, y });
    };
    this._pointerUpHandler = () => {
      this.pointerDown = false;
    };
    window.addEventListener('pointermove', this._pointerMove);
    window.addEventListener('pointerdown', this._pointerDownHandler);
    window.addEventListener('pointerup', this._pointerUpHandler);
  }

  _disablePointerControls() {
    if (!this._pointerMove) return;
    window.removeEventListener('pointermove', this._pointerMove);
    window.removeEventListener('pointerdown', this._pointerDownHandler);
    window.removeEventListener('pointerup', this._pointerUpHandler);
    this._pointerMove = null;
    this._pointerDownHandler = null;
    this._pointerUpHandler = null;
  }

  _pointerLoop() {
    if (!this.running || this.cameraAvailable) return;
    const now = performance.now();
    if (now >= this.nextDetectionTime) {
      this.emit('frameCount');
      this.nextDetectionTime = now + this.frameInterval;
    }
    requestAnimationFrame(this._pointerLoop.bind(this));
  }

  update() {
  }

  on(event, handler) {
    (this.handlers[event] = this.handlers[event] || []).push(handler);
  }

  off(event, handler) {
    if (!this.handlers[event]) return;
    this.handlers[event] = this.handlers[event].filter(h => h !== handler);
  }

  emit(event, data) {
    (this.handlers[event] || []).forEach(h => h(data));
  }
}
