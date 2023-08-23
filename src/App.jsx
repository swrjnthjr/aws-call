import { useEffect, useRef } from "react";
import "./App.css";
import useMasterKenisisClient from "./Hooks/masterKenisisClient.hook";

function App() {
  const { kenisisState, handleCallBtn, handleReceiveBtn, refVideo, refRemortVideo, handleStartBtn, setKenisisState } =
    useMasterKenisisClient();

  const VideoRenderer = () => {
    // let audioTracks = stream.getAudioTracks();
    const stream = kenisisState?.remoteStream
    console.log(stream, kenisisState)

    let videoTracks = stream?.getVideoTracks();
    console.log("Video Tracking", videoTracks, videoTracks?.length);

    return videoTracks?.map((video, index) => {
      console.log("data", index, video, typeof (video))
      const streamToShow = new MediaStream();
      streamToShow.addTrack(video);

      console.log(index, streamToShow)

      return <video
        key={index}
        id={"Peer" + index}
        // ref={(current) => { if (current.srcObject) current.srcObject = streamToShow }}
        // srcObject={streamToShow}
        ref={(ref) => {
          if (ref) ref.srcObject = streamToShow;
        }}
        autoPlay
        playsInline
        controls />
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      <input type="text" name="userId" onChange={(e) => {
        const { name, value } = e.target
        console.log(name, value)
        setKenisisState({ ...kenisisState, "userId": value })
      }} />

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
            autoPlay
            playsInline
            controls
            muted
            className="video"></video>

          <p>testing video</p>
          <div>
            <VideoRenderer />
          </div>
        </div>
        <div>
          <p>Receiver</p>
          <video
            ref={refRemortVideo}
            className="video"
            autoPlay
            playsInline
            controls
          ></video>
        </div>
      </div>
    </div>
  );
}

export default App;
