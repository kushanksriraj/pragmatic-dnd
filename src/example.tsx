import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import invariant from "tiny-invariant";
import { triggerPostMoveFlash } from "@atlaskit/pragmatic-drag-and-drop-flourish/trigger-post-move-flash";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import * as liveRegion from "@atlaskit/pragmatic-drag-and-drop-live-region";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  ColumnMap,
  getBasicData,
  Person,
} from "./pragmatic-drag-and-drop/docs/examples/data/people";
import Board from "./pragmatic-drag-and-drop/docs/examples/pieces/board/board";
import {
  BoardContext,
  BoardContextValue,
} from "./pragmatic-drag-and-drop/docs/examples/pieces/board/board-context";
import { Column } from "./pragmatic-drag-and-drop/docs/examples/pieces/board/column";
import { createRegistry } from "./pragmatic-drag-and-drop/docs/examples/pieces/board/registry";

type Outcome = {
  type: "card-move";
  finishColumnId: string;
  itemIndexInStartColumn: number;
  itemIndexInFinishColumn: number;
};

type Trigger = "pointer" | "keyboard";

type Operation = {
  trigger: Trigger;
  outcome: Outcome;
};

type BoardState = {
  columnMap: ColumnMap;
  orderedColumnIds: string[];
  lastOperation: Operation | null;
};

export default function BoardExample() {
  const [data, setData] = useState<BoardState>(() => {
    const base = getBasicData();
    return {
      ...base,
      lastOperation: null,
    };
  });

  const stableData = useRef(data);

  useEffect(() => {
    stableData.current = data;
  }, [data]);

  const [registry] = useState(createRegistry);

  const { lastOperation } = data;

  useEffect(() => {
    if (lastOperation === null) {
      return;
    }
    const { outcome } = lastOperation;
    if (outcome.type === "card-move") {
      const { finishColumnId, itemIndexInFinishColumn } = outcome;
      const data = stableData.current;
      const destinationColumn = data.columnMap[finishColumnId];
      const item = destinationColumn.items[itemIndexInFinishColumn];
      const entry = registry.getCard(item.userId);
      triggerPostMoveFlash(entry.element);
    }
  }, [lastOperation, registry]);

  useEffect(() => {
    return liveRegion.cleanup();
  }, []);

  const getColumns = useCallback(() => {
    const { columnMap, orderedColumnIds } = stableData.current;
    return orderedColumnIds.map((columnId) => columnMap[columnId]);
  }, []);

  const moveCard = useCallback(
    ({
      startColumnId,
      finishColumnId,
      itemIndexInStartColumn,
      itemIndexInFinishColumn,
      trigger = "keyboard",
    }: {
      startColumnId: string;
      finishColumnId: string;
      itemIndexInStartColumn: number;
      itemIndexInFinishColumn?: number;
      trigger?: "pointer" | "keyboard";
    }) => {
      if (startColumnId === finishColumnId) {
        return;
      }
      setData((data) => {
        const sourceColumn = data.columnMap[startColumnId];
        const destinationColumn = data.columnMap[finishColumnId];
        const item: Person = sourceColumn.items[itemIndexInStartColumn];

        const destinationItems = Array.from(destinationColumn.items);
        // Going into the first position if no index is provided
        const newIndexInDestination = itemIndexInFinishColumn ?? 0;
        destinationItems.splice(newIndexInDestination, 0, item);

        const updatedMap = {
          ...data.columnMap,
          [startColumnId]: {
            ...sourceColumn,
            items: sourceColumn.items.filter((i) => i.userId !== item.userId),
          },
          [finishColumnId]: {
            ...destinationColumn,
            items: destinationItems,
          },
        };

        const outcome: Outcome | null = {
          type: "card-move",
          finishColumnId,
          itemIndexInStartColumn,
          itemIndexInFinishColumn: newIndexInDestination,
        };

        return {
          ...data,
          columnMap: updatedMap,
          lastOperation: {
            outcome,
            trigger: trigger,
          },
        };
      });
    },
    []
  );

  const [instanceId] = useState(() => Symbol("instance-id"));

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return source.data.instanceId === instanceId;
        },
        onDrop(args) {
          const { location, source } = args;
          // didn't drop on anything
          if (!location.current.dropTargets.length) {
            return;
          }
          // need to handle drop
          // 1. remove element from original position
          // 2. move to new position

          // Dragging a card
          if (source.data.type === "card") {
            const itemId = source.data.itemId;
            invariant(typeof itemId === "string");
            // TODO: these lines not needed if item has columnId on it
            const [, startColumnRecord] = location.initial.dropTargets;
            const sourceId = startColumnRecord.data.columnId;
            invariant(typeof sourceId === "string");
            const sourceColumn = data.columnMap[sourceId];
            const itemIndex = sourceColumn.items.findIndex(
              (item) => item.userId === itemId
            );

            if (location.current.dropTargets.length === 1) {
              const [destinationColumnRecord] = location.current.dropTargets;
              const destinationId = destinationColumnRecord.data.columnId;
              invariant(typeof destinationId === "string");
              const destinationColumn = data.columnMap[destinationId];
              invariant(destinationColumn);

              // reordering in same column
              if (sourceColumn === destinationColumn) {
                return;
              }

              // moving to a new column
              moveCard({
                itemIndexInStartColumn: itemIndex,
                startColumnId: sourceColumn.columnId,
                finishColumnId: destinationColumn.columnId,
                trigger: "pointer",
              });
              return;
            }

            // [not sure what is the diff between the above func and this]
            // dropping in a column (relative to a card)
            if (location.current.dropTargets.length === 2) {
              const [destinationCardRecord, destinationColumnRecord] =
                location.current.dropTargets;
              const destinationColumnId = destinationColumnRecord.data.columnId;
              invariant(typeof destinationColumnId === "string");
              const destinationColumn = data.columnMap[destinationColumnId];

              const indexOfTarget = destinationColumn.items.findIndex(
                (item) => item.userId === destinationCardRecord.data.itemId
              );
              const closestEdgeOfTarget: Edge | null = extractClosestEdge(
                destinationCardRecord.data
              );

              if (sourceColumn === destinationColumn) {
                return;
              }

              // case 2: moving into a new column relative to a card

              const destinationIndex =
                closestEdgeOfTarget === "bottom"
                  ? indexOfTarget + 1
                  : indexOfTarget;

              moveCard({
                itemIndexInStartColumn: itemIndex,
                startColumnId: sourceColumn.columnId,
                finishColumnId: destinationColumn.columnId,
                itemIndexInFinishColumn: destinationIndex,
                trigger: "pointer",
              });
            }
          }
        },
      })
    );
  }, [data, instanceId, moveCard]);

  const contextValue: BoardContextValue = useMemo(() => {
    return {
      getColumns,
      moveCard,
      registerCard: registry.registerCard,
      registerColumn: registry.registerColumn,
      instanceId,
    };
  }, [getColumns, registry, moveCard, instanceId]);

  return (
    <BoardContext.Provider value={contextValue}>
      <Board>
        {data.orderedColumnIds.map((columnId) => {
          return <Column column={data.columnMap[columnId]} key={columnId} />;
        })}
      </Board>
    </BoardContext.Provider>
  );
}
