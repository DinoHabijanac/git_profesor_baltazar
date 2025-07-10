import Engine from "@engine/Engine.js";
import SceneManager from "@engine/SceneManager.js";
import InputManager from "@engine/InputManager.js";
import AssetManager from "@engine/AssetManager.js";
import BaseScene from "@engine/BaseScene.js";

import StartMenuScene from "@scenes/StartMenuScene.js";
import DrawingScene from "@scenes/DrawingScene.js";
import MemoryScene from "@scenes/MemoryScene.js";
import KSPScene from "@scenes/KSPScene.js";

(async () => {
  const videoEl = document.querySelector("#inputVideo");

  const input = new InputManager({ videoElement: videoEl });
  const assets = new AssetManager();
  const scenes = new SceneManager();

  scenes.register("StartMenu", StartMenuScene);
  scenes.register("Drawing", DrawingScene);
  scenes.register("Memory", MemoryScene);
  scenes.register("KSP", KSPScene);

  const engine = new Engine({
    sceneManager: scenes,
    inputManager: input,
    assetManager: assets,
  });
  await engine.init();

  await scenes.switch("KSP");
  engine.start();
})();
