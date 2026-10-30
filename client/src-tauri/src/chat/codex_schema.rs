// Checks JSON against the protocol schema of `codex app-server` 0.166.0, from
// `codex app-server generate-json-schema --experimental --out DIR`. Handles
// the JSON Schema keywords that schema uses; `format` is not checked.

use serde_json::Value;
use std::sync::OnceLock;

fn root() -> &'static Value {
    static ROOT: OnceLock<Value> = OnceLock::new();
    ROOT.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../tests/codex-app-server-0.166.0/codex_app_server_protocol.schemas.json"
        ))
        .unwrap()
    })
}

/// Checks `value` against the definition `name`, such as `ServerRequest`
/// or `v2/ThreadStartResponse`.
pub fn check(name: &str, value: &Value) -> Result<(), String> {
    let schema = definition(&format!("#/definitions/{name}"))?;
    valid(schema, value, "")
}

fn definition(reference: &str) -> Result<&'static Value, String> {
    let pointer = reference
        .strip_prefix('#')
        .ok_or(format!("unknown $ref {reference}"))?;
    root()
        .pointer(pointer)
        .ok_or(format!("unknown $ref {reference}"))
}

fn has_type(value: &Value, name: &str) -> bool {
    match name {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        "number" => value.is_number(),
        "integer" => value.is_i64() || value.is_u64(),
        _ => false,
    }
}

fn valid(schema: &Value, value: &Value, at: &str) -> Result<(), String> {
    let schema = match schema {
        Value::Bool(true) => return Ok(()),
        Value::Bool(false) => return Err(format!("{at}: not allowed")),
        Value::Object(schema) => schema,
        _ => return Err(format!("{at}: bad schema")),
    };
    // In draft 7 a $ref replaces its siblings.
    if let Some(Value::String(reference)) = schema.get("$ref") {
        return valid(definition(reference)?, value, at);
    }
    if let Some(types) = schema.get("type") {
        let ok = match types {
            Value::String(name) => has_type(value, name),
            Value::Array(names) => names
                .iter()
                .any(|name| name.as_str().is_some_and(|name| has_type(value, name))),
            _ => false,
        };
        if !ok {
            return Err(format!("{at}: {value} is not of type {types}"));
        }
    }
    if let Some(Value::Array(options)) = schema.get("enum") {
        if !options.contains(value) {
            return Err(format!(
                "{at}: {value} is not one of {}",
                Value::Array(options.clone())
            ));
        }
    }
    if let Some(expected) = schema.get("const") {
        if expected != value {
            return Err(format!("{at}: {value} is not {expected}"));
        }
    }
    if let (Some(minimum), Some(number)) = (
        schema.get("minimum").and_then(Value::as_f64),
        value.as_f64(),
    ) {
        if number < minimum {
            return Err(format!("{at}: {value} is below {minimum}"));
        }
    }
    if let (Some(min), Some(text)) = (
        schema.get("minLength").and_then(Value::as_u64),
        value.as_str(),
    ) {
        if (text.chars().count() as u64) < min {
            return Err(format!("{at}: {value} is shorter than {min}"));
        }
    }
    if let Value::Object(object) = value {
        let properties = schema.get("properties").and_then(Value::as_object);
        for name in schema
            .get("required")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            if !object.contains_key(name) {
                return Err(format!("{at}: missing required {name}"));
            }
        }
        for (name, item) in object {
            let path = format!("{at}/{name}");
            match properties.and_then(|p| p.get(name)) {
                Some(property) => valid(property, item, &path)?,
                None => {
                    if let Some(extra) = schema.get("additionalProperties") {
                        valid(extra, item, &path)?;
                    }
                }
            }
        }
    }
    if let (Some(items), Value::Array(list)) = (schema.get("items"), value) {
        for (i, item) in list.iter().enumerate() {
            valid(items, item, &format!("{at}/{i}"))?;
        }
    }
    if let Some(Value::Array(all)) = schema.get("allOf") {
        for part in all {
            valid(part, value, at)?;
        }
    }
    for (keyword, exactly_one) in [("anyOf", false), ("oneOf", true)] {
        let Some(Value::Array(options)) = schema.get(keyword) else {
            continue;
        };
        let results: Vec<Result<(), String>> = options
            .iter()
            .map(|option| valid(option, value, at))
            .collect();
        let matched = results.iter().filter(|r| r.is_ok()).count();
        if matched == 0 || (exactly_one && matched > 1) {
            let errors: Vec<String> = results.into_iter().filter_map(Result::err).collect();
            return Err(format!(
                "{at}: {matched} of the {keyword} options match: {}",
                errors.join(" | ")
            ));
        }
    }
    Ok(())
}

mod tests {
    use super::check;
    use serde_json::json;

    #[test]
    fn the_schema_check_rejects_what_the_schema_forbids() {
        assert_eq!(
            check("ClientNotification", &json!({ "method": "initialized" })),
            Ok(())
        );
        // A required field, a wrong type, an unknown variant.
        assert!(check(
            "v2/ThreadStartResponse",
            &json!({ "thread": { "id": "t" } })
        )
        .is_err());
        assert!(check(
            "v2/GetAccountResponse",
            &json!({ "requiresOpenaiAuth": "yes" })
        )
        .is_err());
        assert!(check(
            "ServerRequest",
            &json!({ "id": 0, "method": "item/fileChange/requestApproval",
                     "params": { "threadId": "t", "turnId": "u" } })
        )
        .is_err());
        assert!(check(
            "FileChangeRequestApprovalResponse",
            &json!({ "decision": "maybe" })
        )
        .is_err());
        assert!(check(
            "FileChangeRequestApprovalResponse",
            &json!({ "decision": "decline" })
        )
        .is_ok());
    }
}
