import { X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { middleTruncate } from "@/lib/truncate";
import type { TabEntry } from "@/store";

interface TabBarProps {
  tabs: TabEntry[];
  activeDocId: number | null;
  onSwitch(docId: number): void;
  onClose(docId: number): void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

interface SortableTabProps {
  tab: TabEntry;
  isActive: boolean;
  onSwitch(docId: number): void;
  onClose(docId: number): void;
}

function SortableTab({ tab, isActive, onSwitch, onClose }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.docId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={() => onSwitch(tab.docId)}
      className={cn(
        "flex items-center gap-1.5 px-3 h-full text-sm whitespace-nowrap border-r border-border/50 select-none cursor-grab active:cursor-grabbing",
        isActive
          ? "bg-background text-foreground border-b-2 border-b-primary -mb-px"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {tab.isDirty && (
        <span aria-label="unsaved changes" className="size-1.5 rounded-full bg-amber-400 shrink-0" />
      )}
      <span title={tab.filename}>{middleTruncate(tab.filename, 24)}</span>
      <button
        type="button"
        aria-label={`Close ${tab.filename}`}
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.docId);
        }}
        className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20 shrink-0"
      >
        <X className="size-3" />
      </button>
    </button>
  );
}

export function TabBar({ tabs, activeDocId, onSwitch, onClose, onReorder }: TabBarProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (tabs.length === 0) return null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = tabs.findIndex((t) => t.docId === active.id);
    const toIndex = tabs.findIndex((t) => t.docId === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      onReorder?.(fromIndex, toIndex);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((t) => t.docId)} strategy={horizontalListSortingStrategy}>
        <div
          role="tablist"
          aria-label="Open documents"
          className="flex h-8 shrink-0 overflow-x-auto border-b bg-muted/30"
        >
          {tabs.map((tab) => (
            <SortableTab
              key={tab.docId}
              tab={tab}
              isActive={tab.docId === activeDocId}
              onSwitch={onSwitch}
              onClose={onClose}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
