import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createVote, getVote, updateVote } from "../api.js";
import Message from "../components/Message.jsx";

// Turns an ISO time from the backend into the format a datetime-local input needs.
function toInputValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())
  );
}

// One page for both creating a new vote and editing a draft.
// Route /admin/votes/new has no :id (create). /admin/votes/:id/edit has one (edit).
function VoteFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [options, setOptions] = useState([]); // list of option labels (text)
  const [newOption, setNewOption] = useState("");

  const [loading, setLoading] = useState(isEdit); // loading the draft to edit
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false); // true if the vote is no longer a draft
  const [error, setError] = useState("");

  // When editing, load the existing vote and fill in the form.
  useEffect(() => {
    if (!isEdit) return;
    async function load() {
      try {
        const vote = await getVote(id);
        setTitle(vote.title);
        setDescription(vote.description || "");
        setOpensAt(toInputValue(vote.opens_at));
        setClosesAt(toInputValue(vote.closes_at));
        setOptions(vote.options.map((option) => option.label));
        if (vote.status !== "draft") {
          setLocked(true);
          setError("Only draft votes can be edited. This vote is already " + vote.status + ".");
        }
      } catch (err) {
        setLocked(true);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // ----- option list helpers -----

  function addOption() {
    const label = newOption.trim();
    if (!label) {
      setError("Type an option first, then press Add.");
      return;
    }
    if (options.some((o) => o.trim().toLowerCase() === label.toLowerCase())) {
      setError('"' + label + '" is already in the list.');
      return;
    }
    setError("");
    setOptions([...options, label]);
    setNewOption("");
  }

  function changeOption(index, value) {
    const copy = [...options];
    copy[index] = value;
    setOptions(copy);
  }

  function removeOption(index) {
    setOptions(options.filter((o, i) => i !== index));
  }

  function moveOption(index, direction) {
    const other = index + direction;
    if (other < 0 || other >= options.length) return;
    const copy = [...options];
    const temp = copy[index];
    copy[index] = copy[other];
    copy[other] = temp;
    setOptions(copy);
  }

  // ----- validation and saving -----

  // Returns an error message, or "" if everything is fine.
  function validate() {
    if (!title.trim()) return "Title is required.";
    if (!description.trim()) return "Description is required.";
    if (newOption.trim()) {
      return "You typed an option but did not add it. Press Add, or clear the box.";
    }
    const labels = options.map((o) => o.trim());
    if (labels.some((label) => label === "")) return "Options cannot be empty.";
    if (labels.length < 2) return "Add at least 2 options.";
    const lower = labels.map((label) => label.toLowerCase());
    if (new Set(lower).size !== lower.length) return "Options must not repeat.";
    if (!opensAt) return "Choose an open time.";
    if (!closesAt) return "Choose a close time.";
    if (new Date(closesAt) <= new Date(opensAt)) return "Close time must be after open time.";
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    const vote = {
      title: title.trim(),
      description: description.trim(),
      opens_at: new Date(opensAt).toISOString(),
      closes_at: new Date(closesAt).toISOString(),
      options: options.map((o) => o.trim()),
    };

    setError("");
    setSaving(true);
    try {
      if (isEdit) {
        await updateVote(id, vote);
      } else {
        await createVote(vote);
      }
      navigate("/admin", { state: { message: "Draft saved. Publish it when you are ready." } });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="loading">
          <span className="spinner"></span> Loading vote...
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>{isEdit ? "Edit draft vote" : "Create vote"}</h1>
      <p>
        <Link to="/admin">&larr; Back to dashboard</Link>
      </p>

      <Message type="error">{error}</Message>

      {!locked && (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              placeholder="Class Representative Election 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Options (at least 2)</label>
            {options.length === 0 && <p className="hint">No options added yet.</p>}
            {options.map((option, index) => (
              <div className="option-row" key={index}>
                <input
                  type="text"
                  aria-label={"Option " + (index + 1)}
                  value={option}
                  onChange={(e) => changeOption(index, e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => moveOption(index, -1)}
                  disabled={index === 0}
                  title="Move up"
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => moveOption(index, 1)}
                  disabled={index === options.length - 1}
                  title="Move down"
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => removeOption(index)}
                >
                  Remove
                </button>
              </div>
            ))}

            <div className="option-row">
              <input
                type="text"
                aria-label="New option"
                placeholder="Type an option, then press Add"
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption();
                  }
                }}
              />
              <button type="button" className="btn btn-small btn-primary" onClick={addOption}>
                Add
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="opensAt">Opens at</label>
            <input
              id="opensAt"
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="closesAt">Closes at</label>
            <input
              id="closesAt"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </div>

          <p className="hint">
            Each account can vote once. Results stay hidden until the vote closes.
            After you publish, the options are locked.
          </p>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save draft"}
          </button>
        </form>
      )}
    </div>
  );
}

export default VoteFormPage;
