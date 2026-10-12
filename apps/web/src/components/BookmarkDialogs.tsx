import { useState, type FormEvent } from 'react';
import { isSaveableUrl, type Bookmark } from '@linkvault/shared';
import { ApiError } from '../lib/api';
import { useCollections, useCreateBookmark, useSummary, useUpdateBookmark } from '../lib/queries';
import { Dialog } from './Dialog';
import { TagInput } from './TagInput';
import { useToast } from './Toast';
import { Button, Field, inputClass } from './ui';

function CollectionSelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const { data: collections = [] } = useCollections();
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      <option value="">Unsorted</option>
      {collections.map((collection) => (
        <option key={collection.id} value={collection.id}>
          {collection.name}
        </option>
      ))}
    </select>
  );
}

function ReadLaterCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-slate-300 accent-indigo-600"
      />
      <span>
        <span className="font-medium">Read later</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          Adds it to your reading list and keeps a copy for offline reading.
        </span>
      </span>
    </label>
  );
}

export function AddBookmarkDialog({
  open,
  onClose,
  defaultCollectionId,
}: {
  open: boolean;
  onClose: () => void;
  defaultCollectionId?: string | null;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save a link"
      description="LinkVault fetches the page and indexes its text so you can search it later."
    >
      {open && <AddBookmarkForm onDone={onClose} defaultCollectionId={defaultCollectionId ?? ''} />}
    </Dialog>
  );
}

function AddBookmarkForm({ onDone, defaultCollectionId }: { onDone: () => void; defaultCollectionId: string }) {
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [collectionId, setCollectionId] = useState(defaultCollectionId);
  const [readLater, setReadLater] = useState(false);
  const [error, setError] = useState<string>();
  const create = useCreateBookmark();
  const { data: summary } = useSummary();
  const toast = useToast();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    if (!isSaveableUrl(candidate)) {
      setError('Enter a full web address, like https://example.com/article');
      return;
    }
    setError(undefined);
    create.mutate(
      { url: candidate, tags, collectionId: collectionId || null, readLater },
      {
        onSuccess: ({ created }) => {
          toast(created ? 'Saved — extracting the page text…' : 'Already in your library — tags and settings updated');
          onDone();
        },
        onError: (err) => setError(err instanceof ApiError ? (err.fields.url ?? err.message) : err.message),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="URL" htmlFor="add-url" error={error}>
        <input
          id="add-url"
          type="url"
          inputMode="url"
          autoFocus
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/article"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'add-url-error' : undefined}
          className={inputClass}
        />
      </Field>
      <Field label="Tags" htmlFor="add-tags">
        <TagInput id="add-tags" value={tags} onChange={setTags} suggestions={summary?.tags.map((t) => t.tag)} />
      </Field>
      <Field label="Collection" htmlFor="add-collection">
        <CollectionSelect id="add-collection" value={collectionId} onChange={setCollectionId} />
      </Field>
      <ReadLaterCheckbox id="add-read-later" checked={readLater} onChange={setReadLater} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Save link
        </Button>
      </div>
    </form>
  );
}

export function EditBookmarkDialog({ bookmark, onClose }: { bookmark: Bookmark | null; onClose: () => void }) {
  return (
    <Dialog open={bookmark !== null} onClose={onClose} title="Edit bookmark">
      {bookmark && <EditBookmarkForm key={bookmark.id} bookmark={bookmark} onDone={onClose} />}
    </Dialog>
  );
}

function EditBookmarkForm({ bookmark, onDone }: { bookmark: Bookmark; onDone: () => void }) {
  const [title, setTitle] = useState(bookmark.title);
  const [tags, setTags] = useState(bookmark.tags);
  const [collectionId, setCollectionId] = useState(bookmark.collectionId ?? '');
  const [readLater, setReadLater] = useState(bookmark.readLater);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useUpdateBookmark();
  const { data: summary } = useSummary();
  const toast = useToast();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setErrors({ title: 'Title cannot be empty' });
      return;
    }
    update.mutate(
      {
        id: bookmark.id,
        input: {
          ...(title.trim() !== bookmark.title && { title: title.trim() }),
          tags,
          collectionId: collectionId || null,
          readLater,
        },
      },
      {
        onSuccess: () => {
          toast('Bookmark updated');
          onDone();
        },
        onError: (err) =>
          setErrors(err instanceof ApiError && Object.keys(err.fields).length ? err.fields : { _: err.message }),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={bookmark.url}>
        {bookmark.url}
      </p>
      <Field label="Title" htmlFor="edit-title" error={errors.title}>
        <input
          id="edit-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={300}
          aria-invalid={Boolean(errors.title)}
          className={inputClass}
        />
      </Field>
      <Field label="Tags" htmlFor="edit-tags">
        <TagInput id="edit-tags" value={tags} onChange={setTags} suggestions={summary?.tags.map((t) => t.tag)} />
      </Field>
      <Field label="Collection" htmlFor="edit-collection">
        <CollectionSelect id="edit-collection" value={collectionId} onChange={setCollectionId} />
      </Field>
      <ReadLaterCheckbox id="edit-read-later" checked={readLater} onChange={setReadLater} />
      {errors._ && (
        <p role="alert" className="text-sm text-red-600">
          {errors._}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
