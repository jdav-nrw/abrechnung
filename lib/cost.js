/**
 * Pretty-prints an amount of money.
 * E.g.:   599   ->   5,99 €
 * @param {number} cents
 * @returns {string}
 */
function formatAmount(cents) {
	const sign = cents < 0 ? "-" : ""
	const eur = Math.floor(Math.abs(cents / 100))
	const ct = Math.abs(cents % 100)
	return `${sign}${eur},${String(ct).padStart(2, '0')} €`
}

/**
 * Parses a pretty printed money string into cents.
 * E.g.:   5,99   ->   599
 * @param {string} input
 * @returns {number} - The number of cents
 */
function parseAmount(input) {
	if (!input) {
		return 0
	}
	const parts = input.match(/^(-)?([0-9]+)([,.](-|[0-9]{2}))? ?€?$/)
	if (!parts) {
		throw new Error("Malformed amount")
	}
	const sign = parts[1] === "-" ? -1 : 1
	const eur = parseInt(parts[2] || "0")
	const ct = parts[4] === "-" ? 0 : parseInt(parts[4] || "0")
	return sign * ((eur * 100) + ct)
}

/**
 * Parses a number from a string.
 * @param {string} input
 * @param {number} opts.maxDecimalPlaces - The max allowed number of decimal places
 * @param {bool} opts.mustBePositive - Whether the number should be positive
 * @returns {number}
 */
function parseNumber(input, { maxDecimalPlaces = 0, mustBePositive = true } = {}) {
	if (!input) {
		return 0
	}
	const regex = (() => {
		let r = "^"
		if (!mustBePositive) {
			r += "-?"
		}
		r += "[0-9]+"
		if (maxDecimalPlaces > 0) {
			r += `([,.]([0-9]{0,${maxDecimalPlaces}}))?`
		}
		r += "$"
		return new RegExp(r)
	})()
	if (!regex.test(input)) {
		throw new Error("Malformed number")
	}
	return parseFloat(input.replace(",", "."))
}

/**
 * Formats a date in standard German notation.
 * @param {Date} date
 * @returns {string} - E.g., 24.12.2024
 */
function formatDate(date) {
	return `${('0' + date.getDate()).slice(-2)}.${('0' + (date.getMonth() + 1)).slice(-2)}.${date.getFullYear()}`
}

/**
 * Triggers a confirmation prompt when the user attempts to leave the page
 * (e.g., by closing the tab, refreshing, navigating back, etc.) if any form
 * field contains data.
 */
function warnBeforeLeavingPage() {
	window.onbeforeunload = function (e) {
		let hasChanges = undefined
		document.querySelectorAll("input").forEach(el => {
			if (el.value) {
				hasChanges = true
			}
		})
		if (document.querySelector("cost-footer")?.overallTotal) {
			hasChanges = true
		}
		return hasChanges
	}
}

/**
 * Base class to derive custom cost kinds from.
 * All fields and methods (except for the constructor) can be safely overriden
 * in the inherited class.
 */
class CostKind {
	// Contains the HTML code for the row.
	template = ""

	constructor(label, props = {}) {
		this.label = label
		this.props = props
	}

	/**
	 * Returns the computed total of the cost kind.
	 * @param {Object} props - The props of this class instance.
	 * @param {function} $ - The `querySelector` method scoped to the template HTML.
	 * @param {function} $$ - The `querySelectorAll` method scoped to the template HTML.
	 */
	total({ props, $, $$ }) {
		return 0
	}

	/**
	 * Callback for adjusting (refreshing) the template HTML after user input.
	 * @param {Object} props - The props of this class instance.
	 * @param {function} $ - The `querySelector` method scoped to the template HTML.
	 * @param {function} $$ - The `querySelectorAll` method scoped to the template HTML.
	 */
	onChange({ props, $, $$ }) { }
}

/**
 * Definition of the <cost-item> element, which contains the row’s input fields.
 * (This is a helper element for internal usage.)
 */
customElements.define("cost-item", class extends HTMLElement {
	total = 0
	isError = false

	connectedCallback() {
		this.attachShadow({ mode: "open" })
	}

	/**
	 * Initializes this element with an associated cost kind.
	 * @param {CostKind} costKind
	 */
	init(costKind) {
		var html = `
			<style>
				@import "lib/style.css";
				.description {
					color: #777;
				}
			</style>
			${costKind.template}
		`
		if ("description" in costKind.props) {
			html += `<br><div class="description noprint">&#128712; <em>${costKind.props.description}</em></div>`
		}
		this.shadowRoot.innerHTML = html

		const params = {
			props: costKind.props,
			"$": (cssSelector) => this.shadowRoot.querySelector(cssSelector),
			"$$": (cssSelector) => this.shadowRoot.querySelectorAll(cssSelector),
		}

		costKind.onChange(params)

		// Catch `change` events from any interactive elements, and
		// recalculate the item’s total amount.
		this.shadowRoot.addEventListener("change", () => {
			try {
				const t = costKind.total(params)
				if (isNaN(t) || typeof t !== "number") {
					throw new Error("Result is not a number")
				}
				this.isError = false
				this.total = t
			} catch (e) {
				this.isError = true
				this.total = 0
			}
			this.dispatchEvent(new CustomEvent("cost-item-updated", {
				bubbles: true,
				composed: true,
			}))
			costKind.onChange(params)
		})

		// Try to find first input element, and give it focus.
		const firstInput = this.shadowRoot.querySelector("input")
		if (firstInput) {
			firstInput.focus()
		}
	}
})

/**
 * Definition of the <cost-section> element, which contains the rows.
 * 
 * Usage:
 *    <cost-section heading="My Costs" id="something">
 *      <script>
 *        document.querySelector("#something").registerOptions([
 *          new MyDerivedCostKind(),
 *        ])
 *      </script>
 *    </cost-section>
 */
customElements.define("cost-section", class extends HTMLElement {
	costKinds = []
	total = 0

	connectedCallback() {
		this.attachShadow({ mode: "open" })
		const heading = this.getAttribute("heading")
		this.shadowRoot.innerHTML = `
			<style>
				@import "lib/style.css";
				:host {
					display: block;
					margin: 1.25em 0 1em 0
				}
				h2 {
					font-size: 1.2em;
					margin: 0;
					padding-bottom: 0.25em;
				}
				#add {
					background-color: #4ba61a;
					color: #fff;
					font-size: 0.9em;
				}
				#sum {
					border-top: 1px solid #666;
					padding: 0.5em 0;
					display: flex;
				}
				#rows {
					border-top: 1px solid #666;
				}
				#rows > * {
					border-top: 1px solid #bbb;
				}
				#rows > *:first-child,
				#rows:empty {
					border-top: none;
				}
				.row {
					display: flex;
					align-items: start;
					padding: 0.5em 0;
				}
				.row .title {
					margin-right: 0.5em;
				}
				.row .item {
					flex: 1;
					padding: 0 0.5em;
				}
				.row .remove {
					background-color: #f00;
					font-family: var(--font-monospace);
					font-size: 1.25em;
					color: #fff;
					border: none;
					margin-right: 0.5em;
				}
				.row.error {
					background-color: #ffdfdf;
				}
				.row.error .total {
					color: #e90000;
					font-weight: bold;
					margin-right: 0.5em;
				}
				@media print {
					.row {
						padding: 0.25em 0;
						page-break-inside: avoid;
					}
				}
			</style>

			<h2>${heading}</h2>
			<slot></slot>
			<div id="rows"></div>
			<div id="sum">
				<select id="add" class="noprint">
					<option value="_" selected disabled>${heading} hinzufügen</option>
				</select>
				<div style="flex: 1"></div>
				<div>
					Summe ${heading}: <span id="total"></span>
				</div>
			</div>

			<template id="row-template">
				<div class="row">
					<button class="remove noprint" title="Entfernen">×</button>
					<strong class="title"></strong>
					<div class="item"></div>
					<div class="total"></div>
				</div>
			</template>
		`

		this.elements = {
			rows: this.shadowRoot.querySelector("#rows"),
			addButton: this.shadowRoot.querySelector("#add"),
			total: this.shadowRoot.querySelector("#total"),
			rowTemplate: this.shadowRoot.querySelector("#row-template"),
		}

		this.refresh()

		// Append new row with <cost-item> if user clicks “add” button.
		this.elements.addButton.addEventListener("change", (evt) => {
			const id = evt.target.value
			if (id === "_") {
				return
			}
			this.appendRow(this.costKinds[id])
		})
	}

	/**
	 * Registers available cost kinds for this section.
	 * @param {CostKind[]} costKinds
	 */
	registerOptions(costKinds) {
		costKinds.forEach(costKind => {
			this.costKinds.push(costKind)
			const id = this.costKinds.length - 1
			const option = document.createElement("option")
			option.value = id
			option.label = costKind.label
			this.shadowRoot.querySelector("#add").appendChild(option)
		})
	}

	/**
	 * Adds a new empty row based on the selected cost kind.
	 * @param {CostKind} costKind
	 */
	appendRow(costKind) {
		// Clone template.
		const clonedRow = this.elements.rowTemplate.content.cloneNode(true)
		const row = {
			container: clonedRow.querySelector(".row"),
			remove: clonedRow.querySelector(".remove"),
			title: clonedRow.querySelector(".title"),
			item: clonedRow.querySelector(".item"),
			total: clonedRow.querySelector(".total"),
		}
		this.elements.rows.appendChild(clonedRow)

		// Initialize row with values.
		row.title.innerText = costKind.label
		row.total.innerText = formatAmount(0)
		row.remove.addEventListener("click", () => {
			// If total is non-zero, double-check removal with user, to prevent
			// accidental removal.
			if (costItem.total !== 0) {
				const title = costKind.label
				const amount = formatAmount(costItem.total)
				const message = `${title} (${amount}) entfernen?`
				if (!window.confirm(message)) {
					return
				}
			}
			row.container.remove() // Remove row element from DOM.
			this.refresh()
			this.dispatchEvent(new CustomEvent("cost-item-updated", {
				bubbles: true,
				composed: true,
			}))
		})

		// Initialize and add `<cost-item>` element to the row.
		const costItem = document.createElement("cost-item")
		row.item.appendChild(costItem)
		costItem.init(costKind)
		costItem.addEventListener("cost-item-updated", (evt) => {
			if (costItem.isError) {
				row.total.innerText = "Ungültige Eingabe"
				row.container.classList.add("error")
			} else {
				row.total.innerText = formatAmount(costItem.total)
				row.container.classList.remove("error")
			}
			this.refresh()
		})

		this.refresh()
	}

	/**
	 * Refreshes view state after user interaction.
	 */
	refresh() {
		// Calculate total of all current items.
		this.total = 0
		this.shadowRoot.querySelectorAll("cost-item").forEach((f) => {
			this.total += f.total
		})
		this.elements.total.innerText = formatAmount(this.total)

		// Restore selection of the first value of the <select> dropdown.
		this.elements.addButton.value = "_"
	}
})

/**
 * Definition of the <cost-header> element.
 * 
 * Usage: <cost-header heading="My Title" img="logo.png"></cost-header>
 */
customElements.define("cost-header", class extends HTMLElement {
	connectedCallback() {
		this.attachShadow({ mode: "open" })
		this.shadowRoot.innerHTML = `
			<style>
				@import "lib/style.css";
				.container {
					display: flex;
					border-bottom: var(--border-thick);
					padding-bottom: 0.5em;
					font-size: 0.9em;
				}
				h1 {
					font-size: 1.75em;
					margin: 0;
				}
				img {
					height: 7em;
				}
				@media print {
					img {
						filter: grayscale(1);
					}
				}
			</style>

			<div class="container">
				<div style="flex: 1">
					<h1>${this.getAttribute("heading")}</h1>
					<slot></slot>
				</div>
				<img src="${this.getAttribute("img")}">
			</div>
		`
	}
})

/**
 * Definition of the <cost-footer> element, which displays the sum of all
 * connected <cost-section> elements.
 * 
 * Usage: <cost-footer connect-ids="id1 id2"></cost-footer>
 */
customElements.define("cost-footer", class extends HTMLElement {
	overallTotal = 0

	connectedCallback() {
		this.attachShadow({ mode: "open" })
		this.shadowRoot.innerHTML = `
			<style>
				@import "lib/style.css";
				:host {
				display: block;
					margin-top: 2em;
					padding-top: 0.5em;
					border-top: var(--border-thick);
				}
				#overall-total {
					text-align: right;
					font-weight: bold;
					font-size: 1.15em;
				}
				.line-above {
					border-top: 1px solid #000;
					padding-left: 0.25em;
				}
				input {
					border-bottom: 0;
				}
				#signature {
					display: grid;
					margin: 1.5em 0 3em;
					grid-template-columns: 13ch 25ch 35ch;
					grid-template-rows: 1fr;
				}
				#toolbar {
					position: fixed;
					bottom: 0;
					left: 0;
					width: 100%;
					height: var(--toolbar-height);
					box-sizing: border-box;
					background-color: #4ba61a;
					padding: 0.5em 0;
					text-align: center;
				}
				#toolbar button {
					text-transform: uppercase;
					font-weight: bold;
					height: 2em;
					padding: 0 1em;
				}
			</style>

			<div id="overall-total">
				Gesamt: <span></span>
			</div>
			<div>
				<p>Ich versichere die Richtigkeit meiner Angaben.</p>
			</div>
			<div id="signature">
				<input placeholder="(Datum)" value="${formatDate(new Date())}">
				<input placeholder="(Ort)">
				<div><!--Gap--></div>
				<span class="line-above">Datum</span>
				<span class="line-above">Ort</span>
				<span class="line-above">Unterschrift</span>
			</div>
			<div>
				<slot></slot>
			</div>

			<div id="toolbar" class="noprint">
				<button>Drucken</button>
			</div>
		`

		this.elements = {
			overallTotal: this.shadowRoot.querySelector("#overall-total span"),
		}
		this.elements.overallTotal.innerText = formatAmount(0)

		this.shadowRoot.querySelector("#toolbar button").addEventListener("click", () => {
			window.print()
		})

		// Connect to the given <cost-section> elements.
		this.costSections = this.getAttribute("connect-ids").split(" ").map((costSectionId) => {
			const costSection = document.getElementById(costSectionId)
			if (!costSection) {
				console.error(`Cannot find element <cost-section id="${costSectionId}"> on page`)
				return
			}
			if (costSection.tagName.toLowerCase() !== "cost-section") {
				console.error(`Element with id "${costSectionId}" is not of type <cost-section>`)
				return
			}
			costSection.addEventListener("cost-item-updated", (evt) => {
				this.refresh()
			})
			return costSection
		})
	}

	/**
	 * Refreshes view state after user interaction.
	 */
	refresh() {
		this.overallTotal = 0
		this.costSections.forEach((costSection) => {
			this.overallTotal += costSection.total
		})
		this.elements.overallTotal.innerText = formatAmount(this.overallTotal)
	}
})
