import React, { useRef, useEffect, useId } from 'react';
import { Bold, Italic, Underline, Heading2, List, ListOrdered, Link as LinkIcon, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Person } from '../../lib/issue-types';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  people?: Person[];
}

export function RichTextEditor({ value, onChange, placeholder, people = [] }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const [mentionOpen, setMentionOpen] = React.useState(false);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    ref.current?.focus();
    onChange(ref.current?.innerHTML || '');
  };

  const insertMention = (person: Person) => {
    setMentionOpen(false);
    exec('insertHTML', `<strong class="text-primary" data-mention-id="${person.id}">@${person.name}</strong>&nbsp;`);
  };

  return (
    <div className="border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent bg-background overflow-hidden transition-all duration-200">
      <div className="flex flex-wrap items-center gap-1 border-b p-1 bg-muted/40">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.preventDefault(); exec('bold'); }} title="Bold" aria-label="Bold">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.preventDefault(); exec('italic'); }} title="Italic" aria-label="Italic">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.preventDefault(); exec('underline'); }} title="Underline" aria-label="Underline">
          <Underline className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-4 bg-border mx-1" />
        
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.preventDefault(); exec('formatBlock', 'H3'); }} title="Heading" aria-label="Heading">
          <Heading2 className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-4 bg-border mx-1" />
        
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.preventDefault(); exec('insertUnorderedList'); }} title="Bullet List" aria-label="Bullet list">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.preventDefault(); exec('insertOrderedList'); }} title="Numbered List" aria-label="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-4 bg-border mx-1" />
        
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { 
          e.preventDefault(); 
          const url = prompt('Enter URL:'); 
          if (url) exec('createLink', url); 
        }} title="Link" aria-label="Insert link">
          <LinkIcon className="h-4 w-4" />
        </Button>

        {people.length > 0 && (
          <>
            <div className="w-px h-4 bg-border mx-1" />
            <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Mention" aria-label="Mention a person">
                  <AtSign className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-0" align="start">
                <div className="flex flex-col max-h-48 overflow-y-auto">
                  {people.map(person => (
                    <button
                      key={person.id}
                      type="button"
                      className="text-left px-3 py-2 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => insertMention(person)}
                    >
                      <div className="font-medium">{person.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{person.email}</div>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
      
      <p id={helpId} className="sr-only">Use the toolbar buttons to format text. Press Tab to move between formatting controls and the editor.</p>
      <div
        ref={ref}
        className="min-h-[120px] p-3 text-sm outline-none prose prose-sm max-w-none dark:prose-invert empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || "Rich text editor"}
        aria-describedby={helpId}
        data-placeholder={placeholder}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onBlur={(e) => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}
