// Shows an error, success or info banner.
// type is "error", "success" or "info". Shows nothing if there is no text.
function Message({ type, children }) {
  if (!children) {
    return null;
  }
  return (
    <div
      className={"message message-" + type}
      role={type === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export default Message;
