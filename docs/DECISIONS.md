# Architecture & Product Decisions

## Decision 001 — Asset as Core Domain Object
All reusable resources are represented as Assets with specialized metadata/files.
Status: Approved

## Decision 002 — Existing 28 Templates Are Seed Data
The current catalog is migrated into persistent storage and is not the long-term hard-coded source.
Status: Approved

## Decision 003 — User Contribution Is MVP
Users can add website templates, post templates, and future asset types without developer changes.
Status: Approved

## Decision 004 — Phase-Gated Development
One phase at a time; audit approval is required before proceeding.
Status: Approved

## Decision 005 — Replace Static Hub Architecture
The current static Vanilla JS/Node file server architecture must be replaced with a Next.js + PostgreSQL architecture.
Status: Approved

## Decision 006 — NextAuth (Auth.js) Authentication Provider
Use NextAuth for authentication and session management. A temporary Credentials provider is configured for Phase 2 development, to be replaced or connected to the PostgreSQL database in Phase 3.
Status: Proposed
