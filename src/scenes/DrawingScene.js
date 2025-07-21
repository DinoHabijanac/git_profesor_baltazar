import BaseScene from "@engine/BaseScene.js";

export default class DrawingScene extends BaseScene {
  constructor(params) {
    super(params);
    this.container = document.getElementById("gameContainer");
    this.useColorIndicator = true;
    this.cursorOffset = (img) => ({ x: 10, y: -img.clientHeight - 10 });

    this.handData = new Map();
    this.baseLineWidth = 80;

    this.handleMove = this.handleMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.updateFrameCount = this.updateFrameCount.bind(this);
  }

  async init() {
    await this.assets.loadImage("backButton", "/pictures/backButton.webp");
    await this.assets.loadImage("cursor", "/pictures/drawingGame/brush.webp");

    this.styleEl = this.loadStyle("/css/Drawing.css");

    this.sceneEl = document.createElement("div");
    this.sceneEl.classList.add("container", "drawing-container");
    this.sceneEl.innerHTML = `
      <div class="firstLayer layer">
        <button class="btn" id="btnBack"><img src="${
          this.assets.images.get("backButton").src
        }" height="100%"/></button>
      </div>
      <div class="secondLayer layer">
        <button class="btnSecondLayer textStyle btn" id="btnClearBackground">Očisti pozadinu</button>
      </div>
      <div class="thirdLayer layer">
        <canvas class="output_canvas"></canvas>
      </div>
      <div class="fourthLayer">
        <button class="colourPicker btn" style="background: #008801" id="btnGreen"></button>
        <button class="colourPicker btn" style="background: #0000FE" id="btnBlue"></button>
        <button class="colourPicker btn" style="background: #FE0000" id="btnRed"></button>
        <button class="colourPicker btn" style="background: #FFFF01" id="btnYellow"></button>
        <button class="colourPicker btn" style="background: white" id="btnWhite"></button>
        <button class="colourPicker btn" style="background: black" id="btnBlack"></button>
        <button class="colourPicker btn" style="background: linear-gradient(90deg, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)" id="btnRGBPicker"></button> 
      </div>
    `;
    this.container.appendChild(this.sceneEl);

    this.cursorContainer = this.sceneEl;

    this.canvasElement = this.sceneEl.querySelector(".output_canvas");
    this.canvasCtx = this.canvasElement.getContext("2d");
    this.btnBack = this.sceneEl.querySelector("#btnBack");
    this.btnClearBackground = this.sceneEl.querySelector("#btnClearBackground");
    this.btnRGBPicker = this.sceneEl.querySelector("#btnRGBPicker");

    this.colorButtons = {};
    ["Green", "Blue", "Red", "Yellow", "White", "Black"].forEach((name) => {
      const id = `btn${name}`;
      const el = this.sceneEl.querySelector(`#${id}`);
      const color = el.style.background;
      this.colorButtons[id] = { el, color, bg: color };
    });

    this.resize();
    window.addEventListener("resize", this.resize.bind(this));

    this.btnBack.addEventListener("click", () =>
      this.manager.switch("StartMenu")
    );
    this.btnClearBackground.addEventListener("click", () =>
      this.canvasCtx.clearRect(
        0,
        0,
        this.canvasElement.width,
        this.canvasElement.height
      )
    );
    Object.values(this.colorButtons).forEach(({ el, color }) => {
      el.style.background = color;
    });

    this.input.on("move", this.handleMove);
    this.input.on("click", this.handleClick);
    this.input.on("frameCount", this.updateFrameCount);
  }

  update(dt) {}

  render() {}

  async destroy() {
    this.input.off("move", this.handleMove);
    this.input.off("click", this.handleClick);
    this.input.off("frameCount", this.updateFrameCount);
    this.removeStyle(this.styleEl);
    window.removeEventListener("resize", this.resize.bind(this));
    await super.destroy();
    this.sceneEl.remove();
  }

  resize() {
    this.canvasElement.width = this.container.clientWidth * 0.96;
    this.canvasElement.height = this.container.clientHeight * 0.7;
  }

  updateFrameCount() {
    super.updateFrameCount();
  }

  findHandFromCursor(x, y) {
    let closest = null;
    let closestDist = Infinity;
    this.handData.forEach((data, id) => {
      const dist = Math.hypot((data.currX || 0) - x, (data.currY || 0) - y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = id;
      }
    });
    return closest;
  }

  setHandColor(id, color, bg) {
    if (!id) return;
    const data = this.handData.get(id) || {};
    data.color = color;
    this.handData.set(id, data);
    const cursor = this.handCursors.get(id);
    if (cursor) {
      cursor.style.backgroundColor = bg;
      if (cursor.indicator) {
        cursor.indicator.style.backgroundColor = color;
      }
    }
  }

  calculateRGBColor(ratio) {
    let newColor, bgColor;
    if (ratio <= 1 / 6) {
      const g = Math.round(ratio * 6 * 255);
      newColor = `rgb(255, ${g}, 0)`;
      bgColor = `rgba(255, ${g}, 0, 0.3)`;
    } else if (ratio <= 2 / 6) {
      const r = 255 - Math.round((ratio - 1 / 6) * 6 * 255);
      newColor = `rgb(${r}, 255, 0)`;
      bgColor = `rgba(${r}, 255, 0, 0.3)`;
    } else if (ratio <= 3 / 6) {
      const b = Math.round((ratio - 2 / 6) * 6 * 255);
      newColor = `rgb(0, 255, ${b})`;
      bgColor = `rgba(0, 255, ${b}, 0.3)`;
    } else if (ratio <= 4 / 6) {
      const g = 255 - Math.round((ratio - 3 / 6) * 6 * 255);
      newColor = `rgb(0, ${g}, 255)`;
      bgColor = `rgba(0, ${g}, 255, 0.3)`;
    } else if (ratio <= 5 / 6) {
      const r = Math.round((ratio - 4 / 6) * 6 * 255);
      newColor = `rgb(${r}, 0, 255)`;
      bgColor = `rgba(${r}, 0, 255, 0.3)`;
    } else {
      const b = 255 - Math.round((ratio - 5 / 6) * 6 * 255);
      newColor = `rgb(255, 0, ${b})`;
      bgColor = `rgba(255, 0, ${b}, 0.3)`;
    }
    return { newColor, bgColor };
  }

  handleMove({ x, y, i, gesture, thickness }) {
    this.updateCursor(x, y, i);
    const smooth = this.handSmoothed.get(i) || { x, y };
    const screenX = smooth.x * window.innerWidth;
    const screenY = smooth.y * window.innerHeight;
    const xPx = screenX - this.canvasElement.offsetLeft;
    const yPx = screenY - this.canvasElement.offsetTop;

    let data = this.handData.get(i);
    if (!data) {
      data = {
        drawing: false,
        prevX: xPx,
        prevY: yPx,
        color: "black",
        screenX,
        screenY,
      };
      this.handData.set(i, data);
    }

    if (gesture === "Pointing_Up") {
      if (data.drawing) {
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(data.prevX, data.prevY);
        this.canvasCtx.lineTo(xPx, yPx);
        this.canvasCtx.strokeStyle = data.color;
        this.canvasCtx.lineWidth = this.baseLineWidth * thickness;
        this.canvasCtx.stroke();
        this.canvasCtx.closePath();
      }
      data.drawing = true;
      data.prevX = xPx;
      data.prevY = yPx;
    } else {
      data.drawing = false;
    }

    data.currX = xPx;
    data.currY = yPx;
    data.screenX = screenX;
    data.screenY = screenY;
  }

  handleClick({ x, y }) {
    const px = x * window.innerWidth;
    const py = y * window.innerHeight;
    const el = document.elementFromPoint(px, py);
    if (!el) return;
    const handId = this.findHandFromCursor(px, py);

    switch (el.id) {
      case "btnBack":
        this.manager.switch("StartMenu");
        break;
      case "btnClearBackground":
        this.canvasCtx.clearRect(
          0,
          0,
          this.canvasElement.width,
          this.canvasElement.height
        );
        break;
      case "btnRGBPicker":
        if (handId) {
          const rect = el.getBoundingClientRect();
          const ratio = (px - rect.left) / rect.width;
          const { newColor, bgColor } = this.calculateRGBColor(ratio);
          this.setHandColor(handId, newColor, bgColor);
        }
        break;
      default:
        const btn = this.colorButtons[el.id];
        if (btn && handId) {
          this.setHandColor(handId, btn.color, btn.bg);
        }
        if (el.tagName === "BUTTON" && !btn) el.click();
    }
  }
}
