use devutils_lib::commands::diff::diff_text;

#[test]
fn test_diff_text_command_output() {
    let original = "line1\nline2\n".to_string();
    let modified = "line1\nline2_modified\nline3\n".to_string();

    let diff_items = diff_text(original, modified);

    assert!(!diff_items.is_empty());
    assert!(diff_items.iter().any(|item| item.tag == "delete" && item.value.contains("line2")));
    assert!(diff_items.iter().any(|item| item.tag == "insert" && item.value.contains("line2_modified")));
}

#[test]
fn test_diff_text_identical() {
    let text = "apple\nbanana\ncherry\n".to_string();
    let items = diff_text(text.clone(), text);

    assert_eq!(items.len(), 3);
    assert!(items.iter().all(|item| item.tag == "equal"));
    assert_eq!(items[0].old_index, Some(0));
    assert_eq!(items[0].new_index, Some(0));
}

#[test]
fn test_diff_text_empty_inputs() {
    let items = diff_text("".to_string(), "".to_string());
    assert!(items.is_empty());

    let items_insert = diff_text("".to_string(), "hello\n".to_string());
    assert_eq!(items_insert.len(), 1);
    assert_eq!(items_insert[0].tag, "insert");
    assert_eq!(items_insert[0].old_index, None);
    assert_eq!(items_insert[0].new_index, Some(0));

    let items_delete = diff_text("world\n".to_string(), "".to_string());
    assert_eq!(items_delete.len(), 1);
    assert_eq!(items_delete[0].tag, "delete");
    assert_eq!(items_delete[0].old_index, Some(0));
    assert_eq!(items_delete[0].new_index, None);
}
