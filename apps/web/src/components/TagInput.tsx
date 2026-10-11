import { X } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { MAX_TAGS, normalizeTag, parseTags } from '@linkvault/shared';

interface TagInputProps {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

/** Chip-style tag editor: Enter or comma adds, Backspace on empty input removes the last tag. */
export function TagInput({ id, value, onChange, suggestions = [], placeholder = 'Add tags…' }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const commit = (text: string) => {
    const next = parseTags([...value, ...parseTags(text)]);
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'Enter' || event.key === ',') && draft.trim()) {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const available = suggestions.filter((tag) => !value.includes(tag) && tag.startsWith(normalizeTag(draft)));

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="rounded text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        list={listId}
        disabled={value.length >= MAX_TAGS}
        onChange={(event) => {
          const text = event.target.value;
          if (text.includes(',')) commit(text);
          else setDraft(text);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={value.length ? '' : placeholder}
        aria-describedby={`${id}-hint`}
        className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-slate-400 focus-visible:outline-none"
      />
      <datalist id={listId}>
        {available.slice(0, 20).map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <span id={`${id}-hint`} className="sr-only">
        Press Enter or comma to add a tag. Backspace removes the last tag.
      </span>
    </div>
  );
}
