
const snippet = '"extra":{"Part_ID":"sm44827338"}},{"@type":"Video","StreamOrder":"0",';
// Note: User said "extra" metadata is this... 
// If the tag KEY is "extra", and the VALUE is '{"Part_ID":"sm44827338"}},{"@type":"Video","StreamOrder":"0",'
// Then let's test extraction on that value.

const tagValue = '{"Part_ID":"sm44827338"}},{"@type":"Video","StreamOrder":"0",';

function extract(str) {
    console.log("Testing string:", str);

    // 1. Try JSON parse
    try {
        const json = JSON.parse(str);
        if (json.Part_ID) return json.Part_ID;
        console.log("JSON parse success but no Part_ID immediately found");
    } catch (e) {
        console.log("JSON parse failed (expected):", e.message);
    }

    // 2. Try regex
    const regex = /"Part_ID"\s*:\s*"([^"]+)"/i;
    const match = str.match(regex);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

const result = extract(tagValue);
console.log("Extraction result:", result);

// Test with escaped quotes just in case ffprobe returns it that way
const escapedValue = '{\\"Part_ID\\":\\"sm44827338\\"}}';
console.log("Testing escaped string:", escapedValue);
const resultEscaped = extract(escapedValue);
console.log("Extraction result (escaped):", resultEscaped);
