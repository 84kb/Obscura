
const tags = {
    "extra": '{"Part_ID":"sm44827338"}},{"@type":"Video","StreamOrder":"0",'
};

function testLogic(tags) {
    let combinedTags = tags;
    let url;
    const comment = combinedTags.comment || combinedTags.COMMENT || combinedTags.Comment
    let partId = combinedTags.Part_ID || combinedTags.part_id

    // 1. Direct Part_ID check
    console.log("Direct Part_ID:", partId);

    // 2. Scan ALL tags for Part_ID if not found
    if (!partId) {
        for (const key of Object.keys(combinedTags)) {
            const val = combinedTags[key];
            if (typeof val === 'string') {
                console.log(`Scanning key '${key}':`, val);
                // Try parsing as JSON first
                try {
                    if (val.trim().startsWith('{')) {
                        const parsed = JSON.parse(val);
                        if (parsed && (parsed.Part_ID || parsed.part_id)) {
                            partId = parsed.Part_ID || parsed.part_id;
                            console.log("Found via JSON parse");
                            break;
                        }
                    }
                } catch (e) {
                    console.log("JSON parse error:", e.message);
                }

                // Regex fallback
                const match = val.match(/["']?Part_ID["']?\s*[:=]\s*["']?([a-zA-Z0-9]+)["']?/i);
                if (match && match[1]) {
                    partId = match[1];
                    console.log("Found via Regex:", partId);
                    break;
                }
            }
        }
    }

    if (comment && comment.trim().startsWith('https://')) {
        url = comment;
    } else if (partId) {
        url = `https://www.nicovideo.jp/watch/${partId}`;
    } else if (comment && (comment.startsWith('http://') || comment.startsWith('www.'))) {
        url = comment;
    }

    return url;
}

const result = testLogic(tags);
console.log("Result URL:", result);
