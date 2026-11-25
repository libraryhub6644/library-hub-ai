import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Plus,
  Save,
  Share2,
  Trash2,
} from 'lucide-react';
import type { SocialLinkItem, SocialPlatformId } from '../types';
import {
  sanitizeExternalUrl,
  SOCIAL_PLATFORM_PRESETS,
  SocialBrandIcon,
} from './SocialBrandIcon';

interface SocialLinksEditorProps {
  title: string;
  subtitle: string;
  links: SocialLinkItem[];
  onChange: (nextLinks: SocialLinkItem[]) => void;
  onSave?: () => Promise<void> | void;
  saving?: boolean;
  saveLabel?: string;
}

async function compressSocialLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected logo image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Selected file is not a valid image.'));
      img.onload = () => {
        const size = 192;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas compression unavailable.'));
          return;
        }
        const scale = Math.min(size / img.width, size / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const x = Math.round((size - w) / 2);
        const y = Math.round((size - h) / 2);
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, x, y, w, h);
        resolve(canvas.toDataURL('image/png', 0.9));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const SocialLinksEditor: React.FC<SocialLinksEditorProps> = ({
  title,
  subtitle,
  links,
  onChange,
  onSave,
  saving = false,
  saveLabel = 'Save Social Media Links',
}) => {
  const [newPlatform, setNewPlatform] = useState<SocialPlatformId>('instagram');
  const [newName, setNewName] = useState('Instagram');
  const [newUrl, setNewUrl] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [newDesc, setNewDesc] = useState(
    'Daily study hall photos, seat openings, reels, and announcements.'
  );
  const [newCustomLogo, setNewCustomLogo] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handlePlatformSelect = (plat: SocialPlatformId) => {
    setNewPlatform(plat);
    const preset = SOCIAL_PLATFORM_PRESETS.find((p) => p.id === plat);
    if (preset) {
      setNewName(preset.label);
      setNewDesc(preset.defaultDescription);
    }
  };

  const handleUploadNewLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    try {
      const dataUrl = await compressSocialLogoFile(file);
      setNewCustomLogo(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Logo upload failed.');
    }
  };

  const handleUploadExistingLogo = async (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    try {
      const dataUrl = await compressSocialLogoFile(file);
      onChange(
        links.map((item) =>
          item.id === id ? { ...item, customLogoUrl: dataUrl } : item
        )
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Logo upload failed.');
    }
  };

  const handleAddLink = () => {
    setErrorMsg('');
    const safeUrl = sanitizeExternalUrl(newUrl);
    if (!safeUrl) {
      setErrorMsg('Please enter a valid profile URL (e.g. https://instagram.com/yourhandle).');
      return;
    }
    if (!newName.trim()) {
      setErrorMsg('Please enter the app or channel name.');
      return;
    }
    if (links.length >= 15) {
      setErrorMsg('Maximum 15 social media links are allowed.');
      return;
    }

    const nextItem: SocialLinkItem = {
      id: `soc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      platform: newPlatform,
      name: newName.trim().slice(0, 48),
      handle: newHandle.trim().slice(0, 64),
      description: newDesc.trim().slice(0, 260),
      url: safeUrl,
      ...(newCustomLogo ? { customLogoUrl: newCustomLogo } : {}),
    };
    onChange([...links, nextItem]);
    setNewUrl('');
    setNewHandle('');
    setNewCustomLogo('');
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= links.length) return;
    const copy = [...links];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    onChange(copy);
  };

  const activePreset = SOCIAL_PLATFORM_PRESETS.find((p) => p.id === newPlatform);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-parchment flex items-center gap-2">
            <Share2 className="w-5 h-5 accent-text shrink-0" />
            <span>{title}</span>
          </h2>
          <p className="text-xs text-stone mt-1 leading-relaxed">{subtitle}</p>
        </div>
        {onSave && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : saveLabel}</span>
          </button>
        )}
      </div>

      {/* Add New Social App Card */}
      <div className="p-5 rounded-xl surface-panel space-y-4">
        <p className="text-xs uppercase tracking-wider font-semibold accent-text">
          Add Social Media Channel (Official Logo or Custom Icon)
        </p>

        <div className="flex flex-wrap gap-2">
          {SOCIAL_PLATFORM_PRESETS.map((preset) => {
            const active = newPlatform === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePlatformSelect(preset.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border transition-colors cursor-pointer ${
                  active
                    ? 'accent-outline surface-elevated text-parchment font-semibold'
                    : 'hairline-divider text-stone hover:text-parchment'
                }`}
              >
                <SocialBrandIcon platform={preset.id} sizeClass="w-4 h-4" />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs text-stone mb-1">App / Platform Name *</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Instagram"
              maxLength={48}
              className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
            />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1">Profile / Channel URL *</label>
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder={activePreset?.placeholderUrl || 'https://...'}
              maxLength={320}
              className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
            />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1">Handle / Username (Optional)</label>
            <input
              type="text"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="e.g. @libraryhub_official"
              maxLength={64}
              className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
            />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1">Custom App Logo (Optional)</label>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg surface-elevated border hairline-divider flex items-center justify-center shrink-0">
                <SocialBrandIcon
                  platform={newPlatform}
                  customLogoUrl={newCustomLogo}
                  name={newName}
                  sizeClass="w-5 h-5"
                />
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md surface-elevated text-xs text-parchment hover:bg-white/10 cursor-pointer">
                <ImagePlus className="w-3.5 h-3.5 accent-text" />
                <span>{newCustomLogo ? 'Change Custom Logo' : 'Upload Logo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUploadNewLogo(e)}
                  className="hidden"
                />
              </label>
              {newCustomLogo && (
                <button
                  type="button"
                  onClick={() => setNewCustomLogo('')}
                  className="text-xs text-stone hover:text-parchment cursor-pointer"
                >
                  Use Default Icon
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-stone mb-1">
            Short Details (Shown on the Social Directory Page)
          </label>
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Describe what visitors will find on this channel..."
            maxLength={260}
            className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
          />
        </div>

        {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAddLink}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Social Link</span>
          </button>
        </div>
      </div>

      {/* Configured Links List */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wider font-semibold text-stone">
          Configured Social Profiles ({links.length})
        </p>
        {links.length === 0 ? (
          <div className="p-6 rounded-xl surface-panel text-xs text-stone">
            No social media links added yet. Add Instagram, WhatsApp, Facebook, YouTube, or any social profile above—clickable logos will automatically appear above the footer and detailed cards will appear on the Social page.
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((item, idx) => (
              <div
                key={item.id}
                className="p-4 rounded-xl surface-panel space-y-3 border hairline-divider"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full surface-elevated border hairline-divider flex items-center justify-center shrink-0">
                      <SocialBrandIcon
                        platform={item.platform}
                        customLogoUrl={item.customLogoUrl}
                        name={item.name}
                        sizeClass="w-5 h-5"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-parchment truncate">{item.name}</p>
                      <p className="text-xs text-stone truncate">{item.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded surface-elevated text-[11px] text-parchment hover:bg-white/10 cursor-pointer">
                      <ImagePlus className="w-3 h-3 accent-text" />
                      <span>Logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleUploadExistingLogo(item.id, e)}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      className="p-1.5 rounded surface-elevated text-stone hover:text-parchment disabled:opacity-30 cursor-pointer"
                      aria-label="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === links.length - 1}
                      className="p-1.5 rounded surface-elevated text-stone hover:text-parchment disabled:opacity-30 cursor-pointer"
                      aria-label="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(links.filter((l) => l.id !== item.id))}
                      className="p-1.5 rounded surface-elevated text-red-400 hover:bg-red-500/15 cursor-pointer"
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) =>
                      onChange(
                        links.map((l) =>
                          l.id === item.id ? { ...l, name: e.target.value } : l
                        )
                      )
                    }
                    placeholder="App Name"
                    className="px-3 py-1.5 rounded bg-[#0E0D0B] border hairline-divider text-parchment"
                  />
                  <input
                    type="text"
                    value={item.url}
                    onChange={(e) =>
                      onChange(
                        links.map((l) =>
                          l.id === item.id ? { ...l, url: e.target.value } : l
                        )
                      )
                    }
                    placeholder="Profile URL"
                    className="px-3 py-1.5 rounded bg-[#0E0D0B] border hairline-divider text-parchment"
                  />
                  <input
                    type="text"
                    value={item.handle || ''}
                    onChange={(e) =>
                      onChange(
                        links.map((l) =>
                          l.id === item.id ? { ...l, handle: e.target.value } : l
                        )
                      )
                    }
                    placeholder="@handle (optional)"
                    className="px-3 py-1.5 rounded bg-[#0E0D0B] border hairline-divider text-parchment"
                  />
                </div>
                <input
                  type="text"
                  value={item.description || ''}
                  onChange={(e) =>
                    onChange(
                      links.map((l) =>
                        l.id === item.id ? { ...l, description: e.target.value } : l
                      )
                    )
                  }
                  placeholder="Channel description shown on Social page"
                  className="w-full px-3 py-1.5 rounded bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {onSave && links.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : saveLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
};
