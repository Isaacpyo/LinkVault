import { useState, type FormEvent } from 'react';
import { COLLECTION_COLORS, type Collection, type CollectionColor } from '@linkvault/shared';
import { ApiError } from '../lib/api';
import { useCreateCollection, useUpdateCollection } from '../lib/queries';
import { COLLECTION_DOT } from './collectionColors';
import { Dialog } from './Dialog';
import { useToast } from './Toast';
import { Button, Field, inputClass } from './ui';

interface CollectionDialogProps {
  open: boolean;
  /** Existing collection to edit; omit to create. */
  collection?: Collection | null;
  onClose: () => void;
  onDelete?: (collection: Collection) => void;
}

export function CollectionDialog({ open, collection, onClose, onDelete }: CollectionDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={collection ? 'Edit collection' : 'New collection'} size="sm">
      {open && (
        <CollectionForm
          key={collection?.id ?? 'new'}
          collection={collection ?? null}
          onDone={onClose}
          onDelete={onDelete}
        />
      )}
    </Dialog>
  );
}

function CollectionForm({
  collection,
  onDone,
  onDelete,
}: {
  collection: Collection | null;
  onDone: () => void;
  onDelete?: ((collection: Collection) => void) | undefined;
}) {
  const [name, setName] = useState(collection?.name ?? '');
  const [color, setColor] = useState<CollectionColor>(collection?.color ?? 'sky');
  const [error, setError] = useState<string>();
  const create = useCreateCollection();
  const update = useUpdateCollection();
  const toast = useToast();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Give the collection a name');
    const options = {
      onSuccess: () => {
        toast(collection ? 'Collection updated' : 'Collection created');
        onDone();
      },
      onError: (err: Error) => setError(err instanceof ApiError ? (err.fields.name ?? err.message) : err.message),
    };
    if (collection) update.mutate({ id: collection.id, input: { name: name.trim(), color } }, options);
    else create.mutate({ name: name.trim(), color }, options);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Name" htmlFor="collection-name" error={error}>
        <input
          id="collection-name"
          autoFocus
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(error)}
          className={inputClass}
        />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {COLLECTION_COLORS.map((option) => (
            <label key={option} className="relative cursor-pointer">
              <input
                type="radio"
                name="collection-color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                className="peer sr-only"
              />
              <span className="sr-only">{option}</span>
              <span
                aria-hidden
                className={`block size-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-indigo-500 dark:ring-offset-slate-900 dark:peer-checked:ring-white ${COLLECTION_DOT[option]}`}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-2 pt-2">
        {collection && onDelete ? (
          <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => onDelete(collection)}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {collection ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </form>
  );
}
