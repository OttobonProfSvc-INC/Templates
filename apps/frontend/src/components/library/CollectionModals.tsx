'use client';

import React, { useState } from 'react';
import { CollectionDto } from '@sbloom/contracts';
import { Button } from '@/components/ui/Button';

interface CreateCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCollection: CollectionDto) => void;
}

export function CreateCollectionModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateCollectionModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Collection name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/bff/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create collection');
      }

      const created: CollectionDto = await res.json();
      setName('');
      setDescription('');
      onSuccess(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating collection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="modal-create-collection"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Create New Collection</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Collection Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-collection-name"
              type="text"
              placeholder="e.g., Q1 Campaigns, STEM Admissions"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="input-collection-desc"
              rows={3}
              placeholder="Brief note about the purpose or theme of this collection"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" type="button" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              id="btn-submit-create-collection"
              size="sm"
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              {loading ? 'Creating...' : 'Create Collection'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RenameCollectionModalProps {
  collection: CollectionDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: CollectionDto) => void;
}

export function RenameCollectionModal({
  collection,
  isOpen,
  onClose,
  onSuccess,
}: RenameCollectionModalProps) {
  const [name, setName] = useState(collection?.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (collection) {
      setName(collection.name);
    }
  }, [collection]);

  if (!isOpen || !collection) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Collection name cannot be empty');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bff/collections/${encodeURIComponent(collection.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        throw new Error('Failed to update collection name');
      }

      const updated: CollectionDto = await res.json();
      onSuccess(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating collection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="modal-rename-collection"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Rename Collection</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-rename-collection"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" type="button" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              id="btn-submit-rename-collection"
              size="sm"
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              {loading ? 'Saving...' : 'Save Name'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface BulkAddToCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAssetIds: string[];
  collections: CollectionDto[];
  onSuccess: () => void;
}

export function BulkAddToCollectionModal({
  isOpen,
  onClose,
  selectedAssetIds,
  collections,
  onSuccess,
}: BulkAddToCollectionModalProps) {
  const [collectionId, setCollectionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionId) {
      setError('Please select a collection');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/bff/collections/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId,
          assetIds: selectedAssetIds,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to add selected assets to collection');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error adding to collection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="modal-bulk-add-collection"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Add to Collection</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <p className="text-xs text-slate-600">
            Adding <strong className="text-indigo-600 font-semibold">{selectedAssetIds.length}</strong> selected assets to collection:
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Target Collection
            </label>
            <select
              id="select-bulk-collection"
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
            >
              <option value="">Choose a collection...</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.assetCount} assets)
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" type="button" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              id="btn-submit-bulk-add"
              size="sm"
              type="submit"
              disabled={loading || !collectionId}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              {loading ? 'Adding...' : `Add ${selectedAssetIds.length} Assets`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
