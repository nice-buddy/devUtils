use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct InlineSpan {
    pub tag: String, // "insert", "delete", "equal"
    pub text: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DiffItem {
    pub tag: String, // "insert", "delete", "equal"
    pub value: String,
    pub old_index: Option<usize>,
    pub new_index: Option<usize>,
    pub inline_spans: Option<Vec<InlineSpan>>,
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
            inline_spans: None,
        });
    }

    // Post-process to calculate word-level inline_spans for adjacent delete/insert blocks
    let mut i = 0;
    while i < items.len() {
        if items[i].tag == "delete" {
            let mut del_indices = Vec::new();
            while i < items.len() && items[i].tag == "delete" {
                del_indices.push(i);
                i += 1;
            }
            let mut ins_indices = Vec::new();
            while i < items.len() && items[i].tag == "insert" {
                ins_indices.push(i);
                i += 1;
            }

            let pair_count = del_indices.len().min(ins_indices.len());
            for p in 0..pair_count {
                let d_idx = del_indices[p];
                let i_idx = ins_indices[p];
                let d_val = &items[d_idx].value;
                let i_val = &items[i_idx].value;

                let word_diff = TextDiff::from_words(d_val, i_val);
                let mut d_spans = Vec::new();
                let mut i_spans = Vec::new();

                for w_ch in word_diff.iter_all_changes() {
                    match w_ch.tag() {
                        ChangeTag::Equal => {
                            d_spans.push(InlineSpan {
                                tag: "equal".to_string(),
                                text: w_ch.value().to_string(),
                            });
                            i_spans.push(InlineSpan {
                                tag: "equal".to_string(),
                                text: w_ch.value().to_string(),
                            });
                        }
                        ChangeTag::Delete => {
                            d_spans.push(InlineSpan {
                                tag: "delete".to_string(),
                                text: w_ch.value().to_string(),
                            });
                        }
                        ChangeTag::Insert => {
                            i_spans.push(InlineSpan {
                                tag: "insert".to_string(),
                                text: w_ch.value().to_string(),
                            });
                        }
                    }
                }

                items[d_idx].inline_spans = Some(d_spans);
                items[i_idx].inline_spans = Some(i_spans);
            }
        } else {
            i += 1;
        }
    }

    items
}
