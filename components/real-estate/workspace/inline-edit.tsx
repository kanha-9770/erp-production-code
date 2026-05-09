"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * InlineEditCell — click to edit any field in-place. Optimistic by design:
 * the local value updates immediately and the parent's `onSave` mutation
 * runs in the background. If `onSave` rejects, we revert and surface the
 * error inline.
 *
 * Two modes:
 *   - "text"   — single-line text input (Enter saves, Esc cancels)
 *   - "select" — dropdown via shadcn Select; saves on change
 *
 * Don't reach for inline-edit for fields that need validation, multi-step
 * mutations, or that touch >1 entity. Use a modal for those — inline edit
 * is for one-cell updates that should feel instant.
 */

type InlineEditMode = "text" | "select" | "number";

interface InlineEditBaseProps<V> {
  value: V;
  onSave: (next: V) => Promise<void> | void;
  /** Render the value when not editing. */
  render: (v: V) => ReactNode;
  /** Optional: disable the cell (read-only). */
  disabled?: boolean;
  /** Stop propagation on click — useful inside selectable rows. */
  stopRowClick?: boolean;
  className?: string;
}

interface TextEditProps extends InlineEditBaseProps<string | null> {
  mode: "text";
  placeholder?: string;
}

interface NumberEditProps extends InlineEditBaseProps<number | null> {
  mode: "number";
  placeholder?: string;
  /** Step for the number input. */
  step?: number;
}

interface SelectEditProps<V extends string> extends InlineEditBaseProps<V> {
  mode: "select";
  options: Array<{ value: V; label: string }>;
}

type InlineEditProps<V extends string = string> =
  | TextEditProps
  | NumberEditProps
  | SelectEditProps<V>;

export function InlineEditCell<V extends string = string>(props: InlineEditProps<V>) {
  // The discriminated union narrows `onSave`/`render` per `mode`; destructuring
  // collapses them to their intersection (= `never` arg). Cast to a permissive
  // signature so we can call them with the runtime-correct value below.
  const onSave = props.onSave as (next: any) => Promise<void> | void;
  const render = props.render as (v: any) => React.ReactNode;
  const { disabled, stopRowClick, className } = props;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(props.value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep draft in sync if the upstream value changes while we're not editing.
  useEffect(() => {
    if (!editing) setDraft(props.value);
  }, [props.value, editing]);

  const cancel = () => {
    setDraft(props.value);
    setEditing(false);
    setError(null);
  };

  const commit = async (next: any) => {
    if (next === props.value) {
      setEditing(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || "Save failed");
      // Keep editing so the user can retry/correct.
    } finally {
      setPending(false);
    }
  };

  const onClick = (e: React.MouseEvent) => {
    if (disabled) return;
    if (stopRowClick) e.stopPropagation();
    setEditing(true);
  };

  // Render display state.
  if (!editing) {
    return (
      <span
        onClick={onClick}
        className={cn(
          "group inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded",
          !disabled && "cursor-text hover:bg-accent/50",
          className,
        )}
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        <span className="min-w-0 truncate">{render(props.value)}</span>
        {!disabled && (
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
      </span>
    );
  }

  // Editing state.
  if (props.mode === "select") {
    return (
      <span
        className={cn("inline-flex items-center gap-1", className)}
        onClick={(e) => stopRowClick && e.stopPropagation()}
      >
        <Select
          value={draft}
          onValueChange={(v) => {
            setDraft(v);
            commit(v);
          }}
          open
          onOpenChange={(o) => !o && setEditing(false)}
        >
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
        {error && <span className="text-[10px] text-destructive">{error}</span>}
      </span>
    );
  }

  return (
    <TextLikeEditor
      mode={props.mode}
      draft={draft}
      setDraft={setDraft}
      commit={commit}
      cancel={cancel}
      pending={pending}
      error={error}
      stopRowClick={stopRowClick}
      placeholder={"placeholder" in props ? props.placeholder : undefined}
      step={"step" in props ? props.step : undefined}
    />
  );
}

function TextLikeEditor({
  mode,
  draft,
  setDraft,
  commit,
  cancel,
  pending,
  error,
  stopRowClick,
  placeholder,
  step,
}: {
  mode: "text" | "number";
  draft: any;
  setDraft: (v: any) => void;
  commit: (v: any) => void;
  cancel: () => void;
  pending: boolean;
  error: string | null;
  stopRowClick?: boolean;
  placeholder?: string;
  step?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    if (mode === "number") {
      const n = draft === "" || draft == null ? null : Number(draft);
      if (n != null && Number.isNaN(n)) {
        cancel();
        return;
      }
      commit(n);
    } else {
      commit(draft || null);
    }
  };

  return (
    <span
      className="inline-flex items-center gap-1"
      onClick={(e) => stopRowClick && e.stopPropagation()}
    >
      <Input
        ref={inputRef}
        type={mode === "number" ? "number" : "text"}
        step={step}
        value={draft ?? ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") cancel();
        }}
        onBlur={submit}
        placeholder={placeholder}
        disabled={pending}
        className="h-7 text-sm"
      />
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancel}
          >
            <X className="h-3 w-3" />
          </Button>
        </>
      )}
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </span>
  );
}
