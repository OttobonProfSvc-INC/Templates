# Data Model

## Core entities
User, Asset, AssetFile, AssetVersion, AssetMetadata, Collection, CollectionAsset, Review, AssetUsage.

## Asset
- id
- title
- description
- asset_type
- status
- visibility
- creator_id
- client_id (future/nullable)
- created_at
- updated_at
- archived_at

## AssetFile
- id
- asset_id
- storage_key
- file_name
- mime_type
- size
- checksum
- role

## AssetMetadata
- asset_id
- platform
- industry
- audience
- objective
- tone
- dimensions
- tags
- custom_metadata
- ai_generated
- human_verified

## Future
Embedding, Recommendation, Client, BrandKit, Campaign, Comment, ApprovalRequest.
