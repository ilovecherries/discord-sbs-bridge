const md = require("simple-markdown");

const dr = md.defaultRules;
const rules = {
	newline: dr.newline,
	paragraph: dr.paragraph,
	escape: dr.escape,
	blockQuote: {
		...dr.blockQuote,
		match(source, state) {
			return !/^$|\n *$/.test(state.prevCapture != null ? state.prevCapture[0] : "") || state.inQuote || state.nested ? null : /^( *>>> +([\s\S]*))|^( *>(?!>>) +[^\n]*(\n *>(?!>>) +[^\n]*)*\n?)/.exec(source)
		},
		parse(capture, parse, state) {
			const multiblock = /^ *>>> ?/;
			var text = capture[0].replace(/\n$/, ""),
				isMultiblock = !!multiblock.exec(text),
				prefix = isMultiblock ? multiblock : /^ *> ?/gm,
				quoted = text.replace(prefix, ""),
				oldInQuote = state.inQuote || false,
				oldInline = state.inline || false;
			
			state.inQuote = true;
			if(!isMultiblock) {
				state.inline = true;
			}
			var content = parse(quoted, state);
			state.inQuote = oldInQuote;
			state.inline = oldInline;
			
			if(!content.length) {
				content.push({
					type: "text",
					content: " "
				});
			}
			
			return {
				content,
				type: "blockQuote"
			}
		}
	},
	link: dr.link,
	autolink: dr.autolink,
	url: dr.url,
	strong: dr.strong,
	em: dr.em,
	u: dr.u,
	br: dr.br,
	text: dr.text,
	inlineCode: dr.inlineCode,
	codeBlock: {
		order: dr.codeBlock.order,
		match: e => /^```(?:([a-z0-9_+\-.]+?)\n)?\n*([^\n][^]*?)\n*```/i.exec(e),
		parse(capture, parse, state) {
			return {
				lang: capture[1] || "",
				content: capture[2] || "",
				inquote: state.inQuote || false,
			}
		}
	},
	s: {
		order: dr.u.order,
		match: md.inlineRegex(/^~~([\s\S]+?)~~(?!_)/),
		parse: dr.u.parse,
	},
	spoiler: {
		order: dr.text.order,
		match: e => /^\|\|([\s\S]+?)\|\|/.exec(e),
		parse(capture, parse) {
			return {
				content: parse(capture[1])
			}
		}
	}
}

const parser = md.parserFor(rules)

const escape12y = text => text
	.replace(/\//g, "\\/")
	.replace(/\{/g, "\\{")
	.replace(/\*/g, "\\*")
	.replace(/>/g, "\\>")
	.replace(/_/g, "\\_")
	.replace(/~/g, "\\~")
	.replace(/`/g, "\`")

const to12y = tokens => {
	let out = "";
	for(const token of tokens) {
		switch(token.type) {
			case "text":
				out += escape12y(token.content);
				break;
			case "br":
				out += "\n";
				break;
			case "em":
				out += "{/" + to12y(token.content) + "}";
				break;
			case "strong":
				out += "{*" + to12y(token.content) + "}";
				break;
			case "s":
				out += "{~" + to12y(token.content) + "}";
				break;
			case "spoiler":
				out += "{#spoiler= " + to12y(token.content) + "}";
				break;
			case "inlineCode":
				out += "`" + token.content.replace(/`/g, "``") + "`";
				break;
			case "codeBlock":
				out += "```" + token.lang + "\n" + token.content + "```";
				break;
			case "link": {
				const altIsSame = !token.content.length || (token.content && token.content.length === 1 && token.content[0].type === "text" && (token.content[0].content === "" || token.content[0].content === token.target));
				out += token.target + (altIsSame ? "" : "[" + to12y(token.content) + "]");
				break;
			}
			case "blockQuote":
				out += ">{" + to12y(token.content) + "}";
				break;
		}
	}
	return out;
}

const mdto12y = text => {
	const parsed = parser(text, {inline: true})
	return to12y(parsed);
}

module.exports = {
	mdto12y
}