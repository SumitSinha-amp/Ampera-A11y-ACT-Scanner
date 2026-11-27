import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { filterSuggestions } from "@/lib/filter-suggestions";

type FilterAutocompleteInputProps = Omit<ComponentProps<typeof Input>, "list" | "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
  suggestions: readonly (string | null | undefined)[];
};

/** Keep focus in the input while a themed, anchored list provides suggestions. */
export function FilterAutocompleteInput({
  suggestions, value, onValueChange, onFocus, onKeyDown, ...props
}: FilterAutocompleteInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const matches = filterSuggestions(suggestions, value);
  const active = activeIndex < matches.length ? activeIndex : -1;
  const activeId = active >= 0 ? `${listId}-${active}` : undefined;

  useEffect(() => {
    if (open && active >= 0) {
      listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active, value]);

  const select = (suggestion: string) => {
    onValueChange(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <Input {...props} ref={inputRef} value={value} autoComplete="off"
          role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
          aria-expanded={open} aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? activeId : undefined}
          onFocus={(event) => {
            onFocus?.(event);
            if (!props.readOnly && !props.disabled) setOpen(true);
          }}
          onChange={(event) => {
            onValueChange(event.currentTarget.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.defaultPrevented) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (matches.length) setActiveIndex(event.key === "ArrowDown"
                ? (active + 1) % matches.length
                : active <= 0 ? matches.length - 1 : active - 1);
            } else if (event.key === "Enter" && open && active >= 0) {
              event.preventDefault();
              select(matches[active]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        className="filter-autocomplete-popup h-60 max-h-[40vh] w-[var(--radix-popover-trigger-width)] overflow-hidden p-0 duration-150 data-[state=open]:slide-in-from-top-1 motion-reduce:animate-none"
        side="bottom" align="start" sideOffset={4} avoidCollisions={false}
        role="presentation"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target === inputRef.current) event.preventDefault();
        }}
      >
        <div ref={listRef} id={listId} role="listbox"
          aria-label={`${props["aria-label"] ?? "Filter"} suggestions`}
          className="h-full overflow-y-scroll overscroll-contain p-1 [scrollbar-gutter:stable]">
          {matches.length ? matches.map((suggestion, index) => (
            <div key={suggestion} id={`${listId}-${index}`} role="option"
              aria-selected={active === index}
              className="cursor-pointer break-words rounded-sm px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
              onPointerMove={() => setActiveIndex(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => select(suggestion)}>
              {suggestion}
            </div>
          )) : <p role="status" className="px-3 py-2 text-sm text-muted-foreground">No matching suggestions. You can still search freely.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
