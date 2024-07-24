import React from "react";
import ReactDOM from "react-dom";
import ReactDOM18 from "react-dom/client";
import "@atlaskit/css-reset";

import Example from "./example";

// The cursor position works fine
ReactDOM.render(<Example />, document.getElementById("root"));

// The cursor position always goes to top left after dragging
// ReactDOM18.createRoot(document.getElementById("root")!).render(<Example />);
