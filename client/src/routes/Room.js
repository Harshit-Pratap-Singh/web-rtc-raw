import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import streamsaver from "streamsaver";
import workerScript from "./worker.js";
const worker = new Worker(workerScript);

const Room = (props) => {
  const userVideo = useRef();
  const partnerVideo = useRef();
  const peerRef = useRef();
  const socketRef = useRef();
  const otherUser = useRef();
  const userStream = useRef();
  const senders = useRef([]);
  const fileChannel = useRef();
  const fileName = useRef();
  const sendChannel = useRef();
  const file = useRef();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [gotFile, setGotFile] = useState(false);

  //add
  const [peerJoined, setPeerJoined] = useState(false);
  //add
  const [hideCameraFlag, setHideCameraFlag] = useState(!true);
  const [muteFlag, setMuteFlag] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        userVideo.current.srcObject = stream;
        userStream.current = stream;

        userStream.current.getTracks()[0].enabled = false;

        socketRef.current = io.connect("/");
        socketRef.current.emit("join room", props.match.params.roomID);

        socketRef.current.on("other user", (userID) => {
          callUser(userID);
          otherUser.current = userID;
        });

        socketRef.current.on("user joined", (userID) => {
          otherUser.current = userID;
        });

        socketRef.current.on("room full", () => {
          setFull(!full);
          window.location.href = "https://intense-dawn-13733.herokuapp.com/";
        });

        socketRef.current.on("offer", handleRecieveCall);

        socketRef.current.on("answer", handleAnswer);

        socketRef.current.on("ice-candidate", handleNewICECandidateMsg);

        //add
        socketRef.current.on("user left", () => {
          if (peerRef.current) {
            peerRef.current.ontrack = null;
            peerRef.current.onicecandidate = null;
            peerRef.current.close();
            peerRef.current = null;
          }

          setPeerJoined(false);
          console.log("user left called");

          senders.current = [];
        });
        //add

        let leaveRoomButton = document.getElementById("leaveButton");
        leaveRoomButton.addEventListener("click", function () {
          let obj = {
            roomID: props.match.params.roomID,
            otherUser: otherUser.current,
          };
          socketRef.current.emit("leave room", obj);
          window.location.href = "https://intense-dawn-13733.herokuapp.com/";
        });

        socketRef.current.on("room full", () => {});
      });
  }, []);

  function callUser(userID) {
    peerRef.current = createPeer(userID);
    userStream.current
      .getTracks()
      .forEach((track) =>
        senders.current.push(
          peerRef.current.addTrack(track, userStream.current)
        )
      );

    //add
    sendChannel.current = peerRef.current.createDataChannel("sendChannel");
    sendChannel.current.onmessage = handleReceiveMessage;

    fileChannel.current = peerRef.current.createDataChannel("fileChannel");
    fileChannel.current.onmessage = handleReceiveFile;
    fileChannel.current.onopen = () => {
      console.log("file channel open");
    };
    console.log(fileChannel.current);
    //add
  }

  function handleReceiveFile(e) {
    // console.log(e);
    if (e.data.toString().includes("done")) {
      setGotFile(true);
      console.log(e);
      fileName.current = JSON.parse(e.data).fileName;
    } else {
      worker.postMessage(e.data);
    }
  }

  function download() {
    setGotFile(false);
    worker.addEventListener("message", (e) => {
      console.log(fileName.current);
      const stream = e.data.stream();
      const fileStream = streamsaver.createWriteStream(fileName.current);
      stream.pipeTo(fileStream);
    });
    worker.postMessage("download");
  }

  //add
  function handleReceiveMessage(e) {
    setMessages((messages) => [...messages, { yours: false, value: e.data }]);
  }
  //add

  function createPeer(userID) {
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.stunprotocol.org",
        },
        {
          urls: "turn:numb.viagenie.ca",
          credential: "muazkh",
          username: "webrtc@live.com",
        },
      ],
    });

    peer.onicecandidate = handleICECandidateEvent;
    peer.ontrack = handleTrackEvent;
    peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

    return peer;
  }

  function handleNegotiationNeededEvent(userID) {
    peerRef.current
      .createOffer()
      .then((offer) => {
        return peerRef.current.setLocalDescription(offer);
      })
      .then(() => {
        const payload = {
          target: userID,
          caller: socketRef.current.id,
          sdp: peerRef.current.localDescription,
        };
        socketRef.current.emit("offer", payload);
      })
      .catch((e) => console.log(e));
  }

  function handleRecieveCall(incoming) {
    peerRef.current = createPeer();

    // add
    peerRef.current.ondatachannel = (event) => {
      console.log(event.channel.label);
      if (event.channel.label == "sendChannel") {
        sendChannel.current = event.channel;
        sendChannel.current.onmessage = handleReceiveMessage;
      } else {
        fileChannel.current = event.channel;
        fileChannel.current.onmessage = handleReceiveFile;
        fileChannel.current.onopen = () => {
          console.log("file channel open");
        };
      }
    };
    // add

    const desc = new RTCSessionDescription(incoming.sdp);
    peerRef.current
      .setRemoteDescription(desc)
      .then(() => {
        userStream.current
          .getTracks()
          .forEach((track) =>
            senders.current.push(
              peerRef.current.addTrack(track, userStream.current)
            )
          );
      })
      .then(() => {
        return peerRef.current.createAnswer();
      })
      .then((answer) => {
        return peerRef.current.setLocalDescription(answer);
      })
      .then(() => {
        const payload = {
          target: incoming.caller,
          caller: socketRef.current.id,
          sdp: peerRef.current.localDescription,
        };
        socketRef.current.emit("answer", payload);
      });
  }

  function handleAnswer(message) {
    const desc = new RTCSessionDescription(message.sdp);
    peerRef.current.setRemoteDescription(desc).catch((e) => console.log(e));
  }

  function handleICECandidateEvent(e) {
    if (e.candidate) {
      const payload = {
        target: otherUser.current,
        candidate: e.candidate,
      };
      socketRef.current.emit("ice-candidate", payload);
    }
  }

  function handleNewICECandidateMsg(incoming) {
    const candidate = new RTCIceCandidate(incoming);

    peerRef.current.addIceCandidate(candidate).catch((e) => console.log(e));
  }

  function handleTrackEvent(e) {
    //add
    setPeerJoined(true);
    //add
    partnerVideo.current.srcObject = e.streams[0];
  }

  function shareScreen() {
    navigator.mediaDevices.getDisplayMedia({ cursor: true }).then((stream) => {
      const screenTrack = stream.getTracks()[0];

      console.log("senders.current is: ", senders.current);

      senders.current
        .find((sender) => sender.track.kind === "video")
        .replaceTrack(screenTrack);
      screenTrack.onended = function () {
        senders.current
          .find((sender) => sender.track.kind === "video")
          .replaceTrack(userStream.current.getTracks()[1]);
      };
    });
  }

  function handleChange(e) {
    setText(e.target.value);
  }

  function sendMessage() {
    sendChannel.current.send(text);
    setMessages((messages) => [...messages, { yours: true, value: text }]);
    setText("");
  }

  function hideCamera() {
    if (hideCameraFlag) {
      userStream.current.getTracks()[1].enabled = false;
    } else {
      userStream.current.getTracks()[1].enabled = true;
    }

    setHideCameraFlag(!hideCameraFlag);
  }

  function mute() {
    if (muteFlag) {
      userStream.current.getTracks()[0].enabled = false;
    } else {
      userStream.current.getTracks()[0].enabled = true;
    }

    setMuteFlag(!muteFlag);
  }

  function renderMessage(message, index) {
    if (message.yours) {
      return (
        <div key={index}>
          <p>{message.value}</p>
        </div>
      );
    }
    return (
      <div key={index}>
        <p>{message.value}</p>
      </div>
    );
  }

  function handleFile(e) {
    file.current = e.target.files[0];
    console.log(file.current);
  }

  function handleSendFile() {
    console.log(file.current);
    // const stream = file.current.stream();
    // const reader = stream.getReader();

    file.current.arrayBuffer().then((buffer) => {
      const chunkSize = 256 * 1024; //chunk size 16kb
      // if(buffer.byteLength<chunkSize)

      const send = () => {
        while (buffer.byteLength) {
          if (
            fileChannel.current.bufferedAmount >
            fileChannel.current.bufferedAmountLowThreshold
          ) {
            fileChannel.current.onbufferedamountlow = () => {
              fileChannel.current.onbufferedamountlow = null;
              send();
            };
            return;
          }

          const chunk = buffer.slice(0, chunkSize);
          buffer = buffer.slice(chunkSize, buffer.byteLength);
          // console.log(chunk);
          fileChannel.current.send(chunk);
        }
        console.log("done--->", file.name);
        fileChannel.current.send(
          JSON.stringify({ done: true, fileName: file.current.name })
        );
      };

      send();
    });

    // fileChannel.current.bufferedAmountLowThreshold = 65535
    // const send=()=>{
    //   reader.read().then((obj)=>{
    //     if(obj.done)return;
    //     console.log(obj);
    //     send();
    //    })

    // }
    // send()
    // console.log("reader==>", reader);
    // console.log("bufferedAmount-->", fileChannel.current.bufferedAmount);
    // console.log(
    //   "bufferedAmountLowThreshold-->",
    //   fileChannel.current.bufferedAmountLowThreshold
    // );
    // const sendFile = () => {
    //   if (
    //     fileChannel.current.bufferedAmount <=
    //       fileChannel.current.bufferedAmountLowThreshold
    //   ) {
    //     console.log("ppppp");
    //     reader.read().then(({ done, value }) => {
    //       console.log("done--->", done);
    //       console.log("value----->", value?.byteLength);

    //       if (done) {
    //         console.log("done--->", file.current.name);
    //         fileChannel.current.send(
    //           JSON.stringify({ done: true, fileName: file.current.name })
    //         );
    //         return;
    //       }
    //       else {
    //         fileChannel.current.send(value);
    //         // reader.read().then(({done, value}) => helper(done, value));
    //         // setTimeout(sendFile, 2000);
    //         sendFile()
    //       }
    //     });
    //   } else {
    //     fileChannel.current.onbufferedamountlow = () => {
    //       fileChannel.current.onbufferedamountlow = null;
    //       sendFile();
    //     };
    //     console.log(fileChannel.current);
    //     console.log(
    //       "fileChannel.current.onbufferedamountlow--->",
    //       fileChannel.current.onbufferedamountlow
    //     );
    //   }
    // };
    // sendFile()

    // reader.read().then((obj) => {
    //   helper(obj.done, obj.value);
    // });

    // function helper(done, value) {
    //   if (done) {
    //     console.log("done--->", file.current.name);
    //     fileChannel.current.send(
    //       JSON.stringify({ done: true, fileName: file.current.name })
    //     );
    //     return;
    //   } else {
    //     fileChannel.current.send(value);
    //     // reader.read().then(({done, value}) => helper(done, value));
    //     // setTimeout(sendFile, 2000);
    //     if (
    //       fileChannel.current.bufferedAmount >
    //       fileChannel.current.bufferedAmountLowThreshold
    //     ) {
    //       console.log("hashjkdhkj");
    //       fileChannel.current.onbufferedamountlow = () => {
    //         fileChannel.current.onbufferedamountlow = null;
    //         reader.read().then((obj) => {
    //           helper(obj.done, obj.value);
    //         });
    //       };
    //       return;
    //     }
    //     reader.read().then((obj) => {
    //       helper(obj.done, obj.value);
    //     });
    //   }
    // }
  }

  return (
    <div>
      <div>
        <video
          muted
          // controls
          style={{ height: 500, width: 500 }}
          autoPlay
          ref={userVideo}
        />
        {peerJoined && (
          <video
            // controls
            style={{ height: 500, width: 500 }}
            autoPlay
            ref={partnerVideo}
          />
        )}
        <button onClick={shareScreen}>Share screen</button>
        <button onClick={hideCamera}>Hide Camera</button>
        <button onClick={mute}>Mute</button>
        <button id="leaveButton">Leave Call.</button>
      </div>

      <div style={{ margin: "40px" }}>
        <div className="message-box">
          <div>{messages.map(renderMessage)}</div>
        </div>

        <input type="file" onChange={handleFile} />
        <button onClick={handleSendFile}>Send File</button>
        {gotFile && (
          <div className="lsjdhja">
            do you want to download the file.
            <button onClick={download}>Yes</button>
          </div>
        )}

        <input
          value={text}
          type="text"
          placeholder="say something..."
          onChange={handleChange}
        ></input>
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
};

export default Room;
