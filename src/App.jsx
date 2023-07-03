import { useEffect, useRef } from "react";
import "./App.css";
import useMasterKenisisClient from "./Hooks/masterKenisisClient.hook";

function App() {
  const { kenisisState, handleCallBtn, handleReceiveBtn, refVideo, refRemortVideo,handleStartBtn } =
    useMasterKenisisClient();

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div>
        <button onClick={() => { handleStartBtn() }}>Start</button>
      </div>
      <div style={{ flex: "1" }}>
        <button onClick={() => handleCallBtn()}>Call</button>
        <button onClick={() => handleReceiveBtn()}>Receive</button>
      </div>
      <div style={{ display: "flex" }}>
        <div>
          <p>Creator</p>
          <video
            ref={refVideo}
            autoPlay playsInline controls
            className="video"></video>
        </div>
        <div>
          <p>Receiver</p>
          <video
            ref={refRemortVideo}
            // src="" 
            className="video"
            autoPlay playsInline controls
          ></video>
        </div>
      </div>
    </div>
  );
}

export default App;
