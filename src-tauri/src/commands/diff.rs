use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DiffItem {
    pub tag: String, // "insert", "delete", "equal"
    pub value: String,
    pub old_index: Option<usize>,
    pub new_index: Option<usize>,
}

#[tauri::command]
pub fn diff_text(original: String, modified: String) -> Vec<DiffItem> {
    let diff = TextDiff::from_lines(&original, &modified);
    let mut items = Vec::new();

    for change in diff.iter_all_changes() {
        let tag = match change.tag() {
            ChangeTag::Delete => "delete",
            ChangeTag::Insert => "insert",
            ChangeTag::Equal => "equal",
        };
        items.push(DiffItem {
            tag: tag.to_string(),
            value: change.value().to_string(),
            old_index: change.old_index(),
            new_index: change.new_index(),
        });
    }

    items
}
