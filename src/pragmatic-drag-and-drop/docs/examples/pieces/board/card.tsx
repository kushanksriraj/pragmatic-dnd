import {
  forwardRef,
  Fragment,
  memo,
  Ref,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import invariant from "tiny-invariant";
import Avatar from "@atlaskit/avatar";
// eslint-disable-next-line @atlaskit/design-system/no-banned-imports
import Heading from "@atlaskit/heading";
import {
  attachClosestEdge,
  Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { dropTargetForExternal } from "@atlaskit/pragmatic-drag-and-drop/external/adapter";
import { Box, Grid, Stack, xcss } from "@atlaskit/primitives";
import { token } from "@atlaskit/tokens";
import { Person } from "../../data/people";
import { useBoardContext } from "./board-context";

type State =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement; rect: DOMRect }
  | { type: "dragging" };

const idleState: State = { type: "idle" };
const draggingState: State = { type: "dragging" };

const noMarginStyles = xcss({ margin: "space.0" });
const baseStyles = xcss({
  width: "100%",
  padding: "space.100",
  backgroundColor: "elevation.surface",
  borderRadius: "border.radius.200",
  position: "relative",
  ":hover": {
    backgroundColor: "elevation.surface.hovered",
  },
});

const stateStyles: {
  [Key in State["type"]]: ReturnType<typeof xcss> | undefined;
} = {
  idle: xcss({
    cursor: "grab",
    boxShadow: "elevation.shadow.raised",
  }),
  dragging: xcss({
    opacity: 0.4,
    boxShadow: "elevation.shadow.raised",
  }),
  // no shadow for preview - the platform will add it's own drop shadow
  preview: undefined,
};

type CardPrimitiveProps = {
  closestEdge: Edge | null;
  item: Person;
  state: State;
  actionMenuTriggerRef?: Ref<HTMLButtonElement>;
};

const CardPrimitive = forwardRef<HTMLDivElement, CardPrimitiveProps>(
  function CardPrimitive({ closestEdge, item, state }, ref) {
    const { avatarUrl, name, role, userId } = item;

    return (
      <Grid
        ref={ref}
        testId={`item-${userId}`}
        templateColumns="auto 1fr auto"
        columnGap="space.100"
        alignItems="center"
        xcss={[baseStyles, stateStyles[state.type]]}
      >
        <Avatar size="large" src={avatarUrl}>
          {(props) => (
            // Note: using `div` rather than `Box`.
            // `CustomAvatarProps` passes through a `className`
            // but `Box` does not accept `className` as a prop.
            <div
              {...props}
              // Workaround to make `Avatar` not draggable.
              // Ideally `Avatar` would have a `draggable` prop.
              style={{ pointerEvents: "none" }}
              ref={props.ref as Ref<HTMLDivElement>}
            />
          )}
        </Avatar>
        <Stack space="space.050" grow="fill">
          <Heading level="h400" as="span">
            {name}
          </Heading>
          <Box as="small" xcss={noMarginStyles}>
            {role}
          </Box>
        </Stack>

        {closestEdge && (
          <DropIndicator edge={closestEdge} gap={token("space.100", "0")} />
        )}
      </Grid>
    );
  }
);

export const Card = memo(function Card({ item }: { item: Person }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { userId } = item;
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [state, setState] = useState<State>(idleState);

  const actionMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const { instanceId, registerCard } = useBoardContext();
  useEffect(() => {
    invariant(ref.current);
    return registerCard({
      cardId: userId,
      entry: {
        element: ref.current,
        actionMenuTrigger: null as unknown as HTMLElement,
      },
    });
  }, [registerCard, userId]);

  useEffect(() => {
    const element = ref.current;
    invariant(element);
    return combine(
      draggable({
        element: element,
        getInitialData: () => ({ type: "card", itemId: userId, instanceId }),
        onGenerateDragPreview: ({ location, source, nativeSetDragImage }) => {
          const rect = source.element.getBoundingClientRect();

          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: preserveOffsetOnSource({
              element,
              input: location.current.input,
            }),
            render({ container }) {
              setState({ type: "preview", container, rect });
              return () => setState(draggingState);
            },
          });
        },

        onDragStart: () => setState(draggingState),
        onDrop: () => setState(idleState),
      }),
      dropTargetForExternal({
        element: element,
      }),
      dropTargetForElements({
        element: element,
        canDrop: ({ source }) => {
          return (
            source.data.instanceId === instanceId && source.data.type === "card"
          );
        },
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const data = { type: "card", itemId: userId };

          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ["top", "bottom"],
          });
        },
        onDragEnter: (args) => {
          if (args.source.data.itemId !== userId) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDrag: (args) => {
          if (args.source.data.itemId !== userId) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDragLeave: () => {
          setClosestEdge(null);
        },
        onDrop: () => {
          setClosestEdge(null);
        },
      })
    );
  }, [instanceId, item, userId]);

  return (
    <Fragment>
      <CardPrimitive
        ref={ref}
        item={item}
        state={state}
        closestEdge={closestEdge}
        actionMenuTriggerRef={actionMenuTriggerRef}
      />
      {state.type === "preview" &&
        ReactDOM.createPortal(
          <Box
            style={{
              /**
               * Ensuring the preview has the same dimensions as the original.
               *
               * Using `border-box` sizing here is not necessary in this
               * specific example, but it is safer to include generally.
               */
              boxSizing: "border-box",
              width: state.rect.width,
              height: state.rect.height,
            }}
          >
            <CardPrimitive item={item} state={state} closestEdge={null} />
          </Box>,
          state.container
        )}
    </Fragment>
  );
});
