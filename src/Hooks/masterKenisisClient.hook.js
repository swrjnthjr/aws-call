import { useEffect, useRef, useState } from "react";
import { getKinesisKeys } from "../action";
// import AWS from "aws-sdk";
// import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";

const useMasterKenisisClient = () => {
    const [kenisisState, setKenisisState] = useState({
        localStream: null,
        remoteStream: null,
        kinesisVideoClient: null,
        audio_video: false,
        userId: null
    });

    const masterState = {
        kinesisVideoClient: null,
        signalingClient: null,
        channelARN: null,
        peerConnectionByClientId: {},
        peerConnectionStatsInterval: null
    };

    const trickleIce = true;


    let useTrickle = true;

    const viewerState = {
        kinesisVideoClient: null,
        signalingClient: null,
        channelARN: null,
        peerConnectionByClientId: {},
        peerConnectionStatsInterval: null
    };

    const kinesisVideoClient = new AWS.KinesisVideo({
        region: 'ap-southeast-1',
        accessKeyId: kenisisState?.secretKey,
        secretAccessKey: kenisisState?.secretValue
    });

    const refVideo = useRef(null)
    const refRemortVideo = useRef(null)

    const createSingallingChannel = async (channelName) => {
        const createSignalChannelResponse = await kinesisVideoClient.createSignalingChannel({
            ChannelName: channelName,// masterId-groupId/userId
            ChannelType: "SINGLE_MASTER"
        }).promise();

        console.log("MASTER CHANNEL SETUP", createSignalChannelResponse);
        return createSignalChannelResponse;
    };


    const startMaster = async () => {
        // creating a singaling channel
        console.log('CREATING singaling channel');
        // get signaling channel arn
        const describeSignalingChannel = await kinesisVideoClient.describeSignalingChannel({
            ChannelName: `av-test_${kenisisState.userId}`
        }).promise();
        let channelARN = describeSignalingChannel.ChannelInfo.ChannelARN;
        console.log("MASTER Channle ARN", channelARN);



        // Get Singaling Channel Enpoint Response
        const getSignalingChannelEndpointResponse = await kinesisVideoClient
            .getSignalingChannelEndpoint({
                ChannelARN: channelARN,
                SingleMasterChannelEndpointConfiguration: {
                    Protocols: ['WSS', 'HTTPS'],
                    Role: KVSWebRTC.Role.MASTER,
                },
            })
            .promise();

        const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce((endpoints, endpoint) => {
            endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
            return endpoints;
        }, {});

        console.log('MASTER Enpoints', endpointsByProtocol);

        // SETUP Signaling Client
        let signalingClient = new KVSWebRTC.SignalingClient({
            channelARN,
            channelEndpoint: endpointsByProtocol.WSS,
            role: KVSWebRTC.Role.MASTER,
            region: 'ap-southeast-1',
            credentials: {
                accessKeyId: kenisisState?.secretKey,
                secretAccessKey: kenisisState?.secretValue,
                sessionToken: '',
            },
            systemClockOffset: kinesisVideoClient.config.systemClockOffset,
        });

        // Get ICE server configuration
        const kinesisVideoSignalingChannelsClient = new AWS.KinesisVideoSignalingChannels({
            region: 'ap-southeast-1',
            accessKeyId: kenisisState?.secretKey,
            secretAccessKey: kenisisState?.secretValue,
            sessionToken: '',
            endpoint: endpointsByProtocol.HTTPS,
            correctClockSkew: true,
        });
        const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
            .getIceServerConfig({
                ChannelARN: channelARN,
            })
            .promise();
        const iceServers = [];
        iceServers.push({ urls: `stun:stun.kinesisvideo.ap-southeast-1.amazonaws.com:443` });

        getIceServerConfigResponse.IceServerList.forEach((iceServer) =>
            iceServers.push({
                urls: iceServer.Uris,
                username: iceServer.Username,
                credential: iceServer.Password,
            }))

        console.log('MASTER ICE Server', iceServers);

        const configuration = {
            iceServers,
            iceTransportPolicy: 'relay'
        };

        const resolution = { width: { ideal: 640 }, height: { ideal: 480 } };

        const constraints = {
            video: resolution,
            audio: true,
        };

        // local stream set by main.js
        signalingClient.on('open', async () => {
            console.log('MASTER is connected to signaling server');
        })

        signalingClient.on('sdpOffer', async (offer, remotClientId) => {
            console.log('MASTER recieved SDP offer from client', remotClientId);
            // create new peer connection usng the offer from the client
            const peerConnection = new RTCPeerConnection(configuration);
            masterState.peerConnectionByClientId[remotClientId] = peerConnection;

            // can be avoided
            if (!masterState.peerConnectionStatsInterval) {
                // assign a periodic funttion to check stats of peer every one second
                masterState.peerConnectionStatsInterval = setInterval(() => peerConnection.getStats().then((stats) => console.log("Peer Connection Stats")), 1000);
            }

            peerConnection.addEventListener('icecandidate', ({ candidate }) => {
                if (candidate) {
                    console.log("MASTER generated ICE Candidate for client", remotClientId);
                    // using trickle ice 
                    if (trickleIce) {
                        console.log('MASTER Sending ICE candidate to client', remotClientId);
                        signalingClient.sendIceCandidate(candidate, remotClientId);;
                    } else {
                        console.log("All ICE candidates have been generated for client".remotClientId);
                        if (!trickleIce) {
                            console.log("Sending Sending SDP answer to client", remotClientId);
                            signalingClient.sendSdpAnswer(peerConnection.localDescription, remotClientId);
                        }
                    }
                }
            });

            // Remote tracks been recieved, adding them to remote view 
            peerConnection.addEventListener('track', (event) => {
                console.log("MASTER adding remote track for", remotClientId);
                // state.setRemoteStream(event.streams[0]);
                // ui to set view stream
                console.log("streams2", event?.streams)
                setKenisisState({ ...kenisisState, remoteStream: event.streams[0] })
                refRemortVideo.current.srcObject = event.streams?.[1]

                console.log("After Setting up remote track");
            });

            let currentState = { ...kenisisState };

            if (currentState.localStream) {
                currentState.localStream.getTracks().forEach((track) => peerConnection.addTrack(track, currentState.localStream));
            }

            await peerConnection.setRemoteDescription(offer);
            console.log("MASTER preparing SDP answer for client", remotClientId);

            await peerConnection.setLocalDescription(
                await peerConnection.createAnswer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                }));

            if (trickleIce) {
                console.log('MASTER sending SDP asnwer to client', remotClientId);
                signalingClient.sendSdpAnswer(peerConnection.localDescription, remotClientId);
            }
            console.log('MASTER Generating ICE candidates for client', remotClientId);
        })

        signalingClient.on('iceCandidate', async (candidate, remoteClientId) => {
            console.log('MASTER Recieved ICE candidate from client', remoteClientId);
            const peerConnection = masterState.peerConnectionByClientId[remoteClientId];
            peerConnection.addIceCandidate(candidate);
        })

        signalingClient.on('close', () => {
            console.log('MASTER Disconnected from singaling channel');
        })

        signalingClient.on('error', () => {
            console.log('MASTER Signaling client error');
        })

        console.log("Master starting connection");
        masterState.signalingClient = signalingClient;
        signalingClient.open();

    };

    const handleStartBtn = async () => {
        await navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => {
                const videoDevice = devices.find((device) => {
                    return device.kind === "videoinput";
                });
                const audioDevice = devices.find(
                    (device) => device.kind === "audioinput"
                );

                return navigator.mediaDevices.getUserMedia({
                    video: { deviceId: videoDevice?.deviceId },
                    audio: { deviceId: audioDevice?.deviceId },
                });
            })
            .then((stream) => {
                setKenisisState({ ...kenisisState, localStream: stream });
                console.log(stream, refVideo.current)
                refVideo.current.srcObject = stream
                console.log(stream, refVideo.current.srcObject)
                console.log("updated")
            })
            .catch((err) => console.log(err));
    }


    const handleCallBtn = async () => {
        startMaster()
    };

    const handleReceiveBtn = async () => {
        console.log("data")
    }
    // const handleReceiveBtn = async () => {
    //     const describeSignalingChannel = await kinesisVideoClient.describeSignalingChannel({
    //         ChannelName: `av-test_${kenisisState.userId}`
    //     }).promise();

    //     let channelARN = describeSignalingChannel.ChannelInfo.ChannelARN;

    //     const getSignalingChannelEndpointResponse = await kinesisVideoClient
    //         .getSignalingChannelEndpoint({
    //             ChannelARN: channelARN,
    //             SingleMasterChannelEndpointConfiguration: {
    //                 Protocols: ['WSS', 'HTTPS'],
    //                 Role: KVSWebRTC.Role.VIEWER,
    //             },
    //         })
    //         .promise();

    //     const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce((endpoints, endpoint) => {
    //         endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
    //         return endpoints;
    //     }, {});

    //     const kinesisVideoSignalingChannelsClient = new AWS.KinesisVideoSignalingChannels({
    //         region: 'ap-southeast-1',
    //         accessKeyId: kenisisState?.secretKey,
    //         secretAccessKey: kenisisState?.secretValue,
    //         sessionToken: '',
    //         endpoint: endpointsByProtocol.HTTPS,
    //         correctClockSkew: true,
    //     });

    //     const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
    //         .getIceServerConfig({
    //             ChannelARN: channelARN,
    //         })
    //         .promise();

    //     const iceServers = [];
    //     //iceServers.push({ urls: `stun:stun.kinesisvideo.ap-southeast-1.amazonaws.com:443`});
    //     getIceServerConfigResponse.IceServerList.forEach((iceServer) =>
    //         iceServers.push({
    //             urls: iceServer.Uris,
    //             username: iceServer.Username,
    //             credential: iceServer.Password,
    //         }))
    //     let signalingClient = new KVSWebRTC.SignalingClient({
    //         channelARN,
    //         channelEndpoint: endpointsByProtocol.WSS,
    //         clientId: Math.random()
    //             .toString(36)
    //             .substring(2)
    //             .toUpperCase(),
    //         role: KVSWebRTC.Role.VIEWER,
    //         region: 'ap-southeast-1',
    //         credentials: {
    //             accessKeyId: kenisisState?.secretKey,
    //             secretAccessKey: kenisisState?.secretValue,
    //             sessionToken: '',
    //         },
    //         systemClockOffset: kinesisVideoClient.config.systemClockOffset,
    //     });

    //     const configuration = {
    //         iceServers,
    //         iceTransportPolicy: 'relay'
    //     };

    //     const resolution = { width: { ideal: 640 }, height: { ideal: 480 } };

    //     const constraints = {
    //         video: resolution,
    //         audio: true,
    //     };

    //     let peerConnection = new RTCPeerConnection(configuration);;

    //     viewerState.peerConnectionStatsInterval = setInterval(() => peerConnection.getStats().then((stats) => console.log("Peer connection stats", stats)), 1000);

    //     signalingClient.on('open', async () => {
    //         console.log('VIEWER connected to signaling service');
    //         // sending local stream to other users
    //         let currentState = kenisisState;
    //         if (currentState.localStream) {
    //             currentState.localStream.getTracks().forEach((track) => peerConnection.addTrack(track, currentState.localStream));
    //         }
    //         console.log('VIEWER creating SDP offer');
    //         await peerConnection.setLocalDescription(
    //             await peerConnection.createOffer({
    //                 offerToReceiveAudio: true,
    //                 offerToReceiveVideo: true,
    //             }),
    //         );

    //         if (useTrickle) {
    //             console.log('viewer sending SDP offer');
    //             signalingClient.sendSdpOffer(peerConnection.localDescription);
    //         }
    //         console.log('VIEWER generating ice candidates');
    //     })

    //     signalingClient.on('sdpAnswer', async (answer) => {
    //         console.log('VIEWER recieved SDP answer');
    //         await peerConnection.setRemoteDescription(answer);
    //     })

    //     signalingClient.on('iceCandidate', (candidate) => {
    //         console.log('VIEWER recieved ICE candidate');
    //         peerConnection.addIceCandidate(candidate);
    //     })

    //     signalingClient.on('close', () => {
    //         console.log('VIEWER disconnected from singaling channel');
    //     })

    //     signalingClient.on('error', (error) => {
    //         console.log('VIEWER Signaling client error', error);
    //     })

    //     peerConnection.addEventListener('icecandidate', ({ candidate }) => {
    //         if (candidate) {
    //             console.log('VIEWER Generated ICE Candidate');
    //             if (useTrickle) {
    //                 console.log('VIEWER Sending ICE candidate');
    //                 signalingClient.sendIceCandidate(candidate);
    //             }
    //         } else {
    //             console.log('VIEWER All ICE candidates have been generated');
    //             // When trickle ICE is disabled, send the offer now that all the ICE candidates have ben generated.
    //             if (!useTrickle) {
    //                 console.log('VIEWER Sending SDP offer');
    //                 signalingClient.sendSdpOffer(peerConnection.localDescription);
    //             }
    //         }
    //     })
    //     // Remote Stream Recieved adding it to state
    //     peerConnection.addEventListener('track', (event) => {
    //         console.log("VIEWER Recieved remote track");
    //         // setting  UI remote stream
    //         console.log("streams",event.streams)
    //         setKenisisState({ ...kenisisState, remoteStream: event.streams[0] })
    //         refRemortVideo.current.srcObject = event.streams[0]

    //         console.log("After setting up remote track", kenisisState);
    //     })

    //     console.log('VIEWER Starting viewer connection');
    //     viewerState.signalingClient = signalingClient;
    //     signalingClient.open();
    // };

    useEffect(() => {
        const getKeys = async () => {
            const data = await getKinesisKeys();
            setKenisisState({ ...kenisisState, ...data });
        };
        getKeys();
    }, []);

    return {
        kenisisState,
        handleCallBtn,
        handleReceiveBtn,
        refVideo,
        refRemortVideo,
        handleStartBtn,

        setKenisisState
    };
};

export default useMasterKenisisClient;
