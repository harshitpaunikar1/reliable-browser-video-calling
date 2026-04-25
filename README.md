# Reliable Browser Video Calling

This repository documents a one-to-one browser calling system built for networks where direct peer connections often fail.

## Domain
EdTech / Real-Time Communication

## Overview
Used WebRTC for live media, room-based signaling for session setup, and TURN fallback so calls still connected on restrictive Wi-Fi or office networks.

## Methodology
1. Framed the problem around one-to-one tutor and student calls, keeping the first version focused on dependable connection setup rather than feature sprawl.
2. Built signaling flow in Node.js and Socket.IO to handle room joins, offer-answer exchange, ICE candidate sharing, and connection-state visibility.
3. Configured STUN and Coturn-backed TURN support so browsers attempted direct media first and relayed only when network conditions required it.
4. Secured the call path behind HTTPS and Nginx because browser camera and microphone access depend on a trusted transport setup.
5. Added room-status feedback so users could understand whether they were connecting directly, waiting on negotiation, or falling back to relay.
6. Kept the architecture intentionally small and explainable, making NAT and firewall handling the core engineering story instead of hiding it.

## Skills
- WebRTC
- Node.js
- Socket.IO Signaling
- Coturn / TURN Infrastructure
- STUN / ICE
- Nginx
- HTTPS / TLS
- Real-Time Session Design

## Source
This README was generated from the portfolio project data used by `/Users/harshitpanikar/Documents/Test_Projs/harshitpaunikar1.github.io/index.html`.
