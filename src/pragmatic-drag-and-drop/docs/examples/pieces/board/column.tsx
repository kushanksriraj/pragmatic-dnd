import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import invariant from "tiny-invariant";
// eslint-disable-next-line @atlaskit/design-system/no-banned-imports
import Heading from "@atlaskit/heading";
import { easeInOut } from "@atlaskit/motion/curves";
import { mediumDurationMs } from "@atlaskit/motion/durations";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { Box, Flex, Inline, Stack, xcss } from "@atlaskit/primitives";
import { ColumnType } from "../../data/people";
import { useBoardContext } from "./board-context";
import { Card } from "./card";
import { ColumnContext, ColumnContextProps } from "./column-context";

const columnStyles = xcss({
  width: "250px",
  backgroundColor: "elevation.surface.sunken",
  borderRadius: "border.radius.300",
  transition: `background ${mediumDurationMs}ms ${easeInOut}`,
  position: "relative",
  /**
   * TODO: figure out hover color.
   * There is no `elevation.surface.sunken.hovered` token,
   * so leaving this for now.
   */
});

const stackStyles = xcss({
  // allow the container to be shrunk by a parent height
  // https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/#the-minimum-size-gotcha-11
  minHeight: "0",
  // ensure our card list grows to be all the available space
  // so that users can easily drop on en empty list
  flexGrow: 1,
});

const scrollContainerStyles = xcss({
  height: "100%",
  overflowY: "auto",
});

const cardListStyles = xcss({
  boxSizing: "border-box",
  minHeight: "100%",
  padding: "space.100",
  gap: "space.100",
});

const columnHeaderStyles = xcss({
  paddingInlineStart: "space.200",
  paddingInlineEnd: "space.200",
  paddingBlockStart: "space.100",
  color: "color.text.subtlest",
  userSelect: "none",
});

/**
 * Note: not making `'is-dragging'` a `State` as it is
 * a _parallel_ state to `'is-column-over'`.
 *
 * Our board allows you to be over the column that is currently dragging
 */

type State =
  | { type: "idle" }
  | { type: "is-card-over" }
  | { type: "generate-safari-column-preview"; container: HTMLElement }
  | { type: "generate-column-preview" };

// preventing re-renders with stable state objects
const idle: State = { type: "idle" };
const isCardOver: State = { type: "is-card-over" };

const stateStyles: {
  [key in State["type"]]: ReturnType<typeof xcss> | undefined;
} = {
  idle: undefined,
  "is-card-over": xcss({
    backgroundColor: "color.background.selected.hovered",
  }),
  /**
   * **Browser bug workaround**
   *
   * _Problem_
   * When generating a drag preview for an element
   * that has an inner scroll container, the preview can include content
   * vertically before or after the element
   *
   * _Fix_
   * We make the column a new stacking context when the preview is being generated.
   * We are not making a new stacking context at all times, as this _can_ mess up
   * other layering components inside of your card
   *
   * _Fix: Safari_
   * We have not found a great workaround yet. So for now we are just rendering
   * a custom drag preview
   */
  "generate-column-preview": xcss({
    isolation: "isolate",
  }),
  "generate-safari-column-preview": undefined,
};

export const Column = memo(function Column({ column }: { column: ColumnType }) {
  const columnId = column.columnId;
  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<State>(idle);

  const { instanceId, registerColumn } = useBoardContext();

  useEffect(() => {
    invariant(columnRef.current);
    invariant(cardListRef.current);
    invariant(scrollableRef.current);
    return combine(
      registerColumn({
        columnId,
        entry: {
          element: columnRef.current,
        },
      }),
      dropTargetForElements({
        element: cardListRef.current,
        getData: () => ({ columnId }),
        canDrop: ({ source }) => {
          return (
            source.data.instanceId === instanceId && source.data.type === "card"
          );
        },
        getIsSticky: () => true,
        onDragEnter: () => setState(isCardOver),
        onDragLeave: () => setState(idle),
        onDragStart: () => setState(isCardOver),
        onDrop: () => setState(idle),
      }),
      autoScrollForElements({
        element: scrollableRef.current,
        canScroll: ({ source }) =>
          source.data.instanceId === instanceId && source.data.type === "card",
      })
    );
  }, [columnId, registerColumn, instanceId]);

  const stableItems = useRef(column.items);
  useEffect(() => {
    stableItems.current = column.items;
  }, [column.items]);

  const getCardIndex = useCallback((userId: string) => {
    return stableItems.current.findIndex((item) => item.userId === userId);
  }, []);

  const getNumCards = useCallback(() => {
    return stableItems.current.length;
  }, []);

  const contextValue: ColumnContextProps = useMemo(() => {
    return { columnId, getCardIndex, getNumCards };
  }, [columnId, getCardIndex, getNumCards]);

  return (
    <ColumnContext.Provider value={contextValue}>
      <Flex
        testId={`column-${columnId}`}
        ref={columnRef}
        direction="column"
        xcss={[columnStyles, stateStyles[state.type]]}
      >
        <Stack xcss={[stackStyles]}>
          <Inline
            alignBlock="center"
            spread="space-between"
            xcss={columnHeaderStyles}
            testId={`column-header-${columnId}`}
          >
            <Heading
              as="span"
              level="h300"
              testId={`column-header-title-${columnId}`}
            >
              {column.title}
            </Heading>
          </Inline>
          <Box xcss={scrollContainerStyles} ref={scrollableRef}>
            <Stack xcss={cardListStyles} ref={cardListRef} space="space.100">
              {/* Virtualization can be added here? */}
              {column.items.map((item) => (
                <Card item={item} key={item.userId} />
              ))}
            </Stack>
          </Box>
        </Stack>
      </Flex>
    </ColumnContext.Provider>
  );
});
