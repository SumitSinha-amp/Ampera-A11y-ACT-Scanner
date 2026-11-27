import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface SearchableFilterProps {
  id?: string;
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
}

/** Search is local to the popup; it never changes the applied filter. */
export function SearchableFilter({
  id, label, options, selected, onChange, multiple = false, disabled,
  emptyMessage = "No matches found.", className,
}: SearchableFilterProps) {
  const [open, setOpen] = useState(false);
  const displayLabel = selected.length === 1
    ? options.find((option) => option.value === selected[0])?.label ?? label
    : selected.length > 1 ? `${selected.length} selected` : label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" disabled={disabled}
          aria-label={`${label}: ${displayLabel}`} aria-haspopup="listbox" aria-expanded={open}
          className={className ?? "h-10 gap-2 font-normal"}>
          <span className="max-w-[180px] truncate">{displayLabel}</span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList aria-label={label}>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option.value} value={`${option.value} ${option.label}`}
                  onSelect={() => {
                    onChange(multiple
                      ? selected.includes(option.value)
                        ? selected.filter((value) => value !== option.value)
                        : [...selected, option.value]
                      : [option.value]);
                    if (!multiple) setOpen(false);
                  }}>
                  <Check aria-hidden="true" className={`h-4 w-4 shrink-0 ${selected.includes(option.value) ? "opacity-100" : "opacity-0"}`} />
                  <span className="min-w-0 break-words">{option.label}</span>
                  {selected.includes(option.value) && <span className="sr-only">Selected</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {multiple && selected.length > 0 && (
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>Clear</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
