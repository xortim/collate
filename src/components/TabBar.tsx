import { useState } from "react";
import { X } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
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

/** Shared tab content — rendered both in SortableTab and DragOverlay. */
function TabContent({ tab }: { tab: TabEntry }) {
  return (
    <>
      {tab.isDirty && (
        <span aria-label="unsaved changes" className="size-1.5 rounded-full bg-amber-400 shrink-0" />
      )}
      <span title={tab.filename}>{middleTruncate(tab.filename, 24)}</span>
      {/* Close button is rendered separately in SortableTab; omitted here intentionally */}
    </>
  );
}

function SortableTab({ tab, isActive, onSwitch, onClose }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.docId });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      onClick={() => onSwitch(tab.docId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSwitch(tab.docId);
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 px-3.5 h-8 text-sm font-medium whitespace-nowrap border-t-2 select-none cursor-grab active:cursor-grabbing transition-colors",
        isDragging && "opacity-0",
        isActive
          ? "bg-muted text-foreground border-primary"
          : "bg-tab-inactive text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
      )}
    >
      <TabContent tab={tab} />
      <button
        type="button"
        aria-label={`Close ${tab.filename}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.docId);
        }}
        className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/30 shrink-0 cursor-default"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function TabBar({ tabs, activeDocId, onSwitch, onClose, onReorder }: TabBarProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (tabs.length === 0) return null;

  const activeTab = activeId !== null ? tabs.find((t) => t.docId === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = tabs.findIndex((t) => t.docId === active.id);
    const toIndex = tabs.findIndex((t) => t.docId === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      onReorder?.(fromIndex, toIndex);
    }
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={tabs.map((t) => t.docId)} strategy={horizontalListSortingStrategy}>
        <div
          role="tablist"
          aria-label="Open documents"
          className="flex shrink-0 overflow-x-auto items-end bg-background border-t border-border pt-1.5 px-2 gap-1"
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

      <DragOverlay dropAnimation={null}>
        {activeTab && (
          <div className="inline-flex items-center gap-1.5 px-3.5 h-8 text-sm font-medium whitespace-nowrap border-t-2 bg-muted text-foreground border-primary cursor-grabbing shadow-lg">
            <TabContent tab={activeTab} />
            <span className="ml-0.5 p-0.5">
              <X className="size-3" />
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
