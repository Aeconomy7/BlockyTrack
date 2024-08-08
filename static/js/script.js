async function fetchWalletBalances(address) {
	const response = await fetch(`/wallet/balance/${address}`);
	return response.json();
}

async function fetchWalletTransactions(address) {
	const response = await fetch(`/wallet/transactions/${address}`);
	return response.json();
}

document.addEventListener('DOMContentLoaded', function() {
	const exchangeRateDiv = document.getElementById('exchange-rate');

	async function fetchExchangeRate() {
		try {
			const response = await fetch('/btc_rate');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			const exchangeRate = data.toFixed(2);
			exchangeRateDiv.innerText = `1 BTC = $${exchangeRate} USD`;
		} catch (error) {
			console.error('Error fetching exchange rate:', error);
			exchangeRateDiv.innerText = 'Error fetching exchange rate';
		}
	}

	// Fetch exchange rate every 180 seconds
	setInterval(fetchExchangeRate, 180000);

	// Initial fetch
	fetchExchangeRate();
});

function createGraphData(transactions) {
	const nodes = new Set();
	const edges = [];
	const humanReadableTransactions = [];

	transactions.forEach(tx => {
		const btcToUsdRate = tx.btc_to_usd_rate;

		tx.inputs.forEach(input => {
			if (input.prev_out && input.prev_out.addr) {
				const tx_id = `${input.prev_out.addr}-${tx.hash}`
				nodes.add(input.prev_out.addr);
				edges.push({
					data: {
						id: `edge-${tx_id}`,
						source: input.prev_out.addr,
						target: tx.hash
					}
				});

				const btcAmount = input.prev_out.value / 1e8;
				const usdAmount = btcAmount * btcToUsdRate;

				humanReadableTransactions.push({
					id: `edge-${tx_id}`,
					from: input.prev_out.addr,
					to: tx.hash,
					btcAmount: btcAmount,
					usdAmount: usdAmount.toFixed(2)
				});
			}
		});

		tx.out.forEach(output => {
			if (output.addr) {
				const tx_id = `${tx.hash}-${output.addr}`
				nodes.add(output.addr);
				edges.push({
					data: {
						id: `edge-${tx_id}`,
						source: tx.hash,
						target: output.addr
					}
				});

				const btcAmount = output.value / 1e8;
				const usdAmount = btcAmount * btcToUsdRate;

				humanReadableTransactions.push({
					id: `edge-${tx_id}`,
					from: tx.hash,
					to: output.addr,
					btcAmount: btcAmount,
					usdAmount: usdAmount.toFixed(2)
				});
			}
		});

		nodes.add(tx.hash);
	});

	return { nodes: Array.from(nodes), edges, humanReadableTransactions };
}

async function renderGraph(address) {
	const transactions = await fetchWalletTransactions(address);
	// collect all addresses within the transactions
	const balances = await fetchWalletBalances(address);
	const graphData = createGraphData(transactions);

	const cy = cytoscape({
		container: document.getElementById('cy'),
		elements: [
			...graphData.nodes.map(id => ({ data: { id, type: 'normal' } })),
			...graphData.edges
		],
		style: [
			{
				selector: 'node[type="normal"]',
				style: {
					'font-family': 'OCR A Std, monospace',
					//'background-image': ['../img/px_bg_darkblue.png'],
					//'background-fit': 'cover',
					//'background-clip': 'node',
					'background-color': 'blue',
					'label': 'data(id)',
					'font-size': '12px'
				}
			},
			{
				selector: 'node[type="target"]',
				style: {
					'font-family': 'OCR A Std, monospace',
					//'background-image': 'url(../img/px_bg_darkpink.png)',
					//'background-repeat': 'repeat',
					'background-color': 'yellow',
					'label': 'data(id)',
					'font-size': '12px'
				}
			},
			{
				selector: 'node:selected',
				style: {
					//'background-image': 'url(../img/px_bg_sea.png)',
					//'background-repeat': 'repeat'
					'background-color': 'green'
				}
			},
			{
				selector: 'edge',
				style: {
					'width': 2,
					'line-color': '#fff',
					'target-arrow-shape': 'triangle',
					'target-arrow-color': '#000',
					'arrow-scale': 1.5
				}
			},
			{
				selector: 'edge:selected',
				style: {
					'width': 3,
					'line-color': 'green',
					'target-arrow-shape': 'triangle',
					'target-arrow-color': 'green',
					'arrow-scale': 1.5
				}
			}
		],
		layout: {
			name: 'cose',
			fit: true,
			directed: true,
			padding: 10
		},
		wheelSensitivity: 0.1,
		minZoom: 0.1,
		maxZoom: 10
	});

	// Function to highlight and scroll to the transaction
	function highlightAndScrollToTransaction(txid) {
		const transactionList = document.getElementById('transaction-list');
		const transactions = document.getElementsByClassName('transaction');

		// Remove previous highlights
		for (let tx of transactions) {
			tx.classList.remove('highlight');
		}

		// Highlight the selected transaction
		const selectedTransaction = document.getElementById(txid);
		if (selectedTransaction) {
			selectedTransaction.classList.add('highlight');
			selectedTransaction.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	function positionNodes() {
		const fromNodes = cy.nodes().filter(node => node.connectedEdges('edge[source = "' + node.id() + '"]').length > 0 && node.connectedEdges('edge[target = "' + node.id() + '"]').length === 0);
		const toNodes = cy.nodes().filter(node => node.connectedEdges('edge[target = "' + node.id() + '"]').length > 0 && node.connectedEdges('edge[source = "' + node.id() + '"]').length === 0);
		const middleNodes = cy.nodes().filter(node => node.connectedEdges('edge[source = "' + node.id() + '"]').length > 0 && node.connectedEdges('edge[target = "' + node.id() + '"]').length > 0);

		const leftX = 100;
		const rightX = 600;
		const middleX = 350;
		const spacingY = 75;

		fromNodes.positions((node, i) => {
			return { x: leftX, y: i * spacingY };
		});

		toNodes.positions((node, i) => {
			return { x: rightX, y: i * spacingY };
		});

		middleNodes.positions((node, i) => {
			return { x: middleX, y: i * spacingY };
		});

		cy.fit(); // Optionally fit the graph to the viewport
	}


	cy.ready(async function () {
		positionNodes(); // Position nodes initially
	});

	cy.on('zoom', (event) => {
		cy.zoom({
			level: event.zoom,
			renderedPosition: { x: event.cy.container().clientWidth / 2, y: event.cy.container().clientHeight / 2 }
		});
	});

	// Enable node selection by clicking
	cy.on('tap', 'node', async function(event) {
		const node = event.target;
		const walletAddress = node.data('id');
		console.log("Wallet ID: " + walletAddress);

		//const balance = await fetchWalletBalance(walletAddress);
		//console.log(balance);
		//if (balance) {
		//	document.getElementById('amount').innerText = `Wallet ${walletAddress}\nUSD Amount: $${balance[1].toFixed(2)}\nBTC Amount: ${balance[0]}`;
		//} else {
		//	console.log("Couldn't find balance for wallet: " + walletAddress); // Debugging log if transaction not found
		//}
		node.select();
	});

	// Add event listener for node unselection
	cy.on('tap', function(event) {
		if (event.target === cy) {
			cy.nodes().unselect();
		}
	});

	// Add event listener for edge selection to display USD amount
	cy.on('tap', 'edge', function(event) {
		const edge = event.target;
		const edgeId = edge.id(); // Get the ID of the clicked edge
		console.log("Edge ID: " + edgeId); // Debugging log for edge ID

		// Highlight the transaction in the transaction list
		highlightAndScrollToTransaction(edgeId);

		// Find the corresponding transaction in the humanReadableTransactions array
		const transaction = graphData.humanReadableTransactions.find(tx => tx.id === edgeId);
		if (transaction) {
			const usdAmount = transaction.usdAmount; // Access the USD amount from the transaction
			const btcAmount = transaction.btcAmount; // Access the BTC amount from the transaction
			document.getElementById('amount').innerText = `Transaction ${edgeId}\nUSD Amount: $${usdAmount}\nBTC Amount": ${btcAmount}`; // Display the USD amount
		} else {
			console.log("Transaction not found for edge ID: " + edgeId); // Debugging log if transaction not found
		}
	});

	displayHumanReadableData(graphData.humanReadableTransactions, balances);

	// Highlight target wallet address
	const searchValue = document.getElementById('wallet-address').value.trim();

	// Clear previous target node
	cy.nodes('[type="target"]').data('type', 'normal');

	// Set the new target node
	const targetNode = cy.getElementById(searchValue);
	if (targetNode.length > 0) {
		targetNode.data('type', 'target');
	}

	// Refresh the styles
	cy.style().update();
}

function displayHumanReadableData(transactions, balance) {
	const balanceContainer = document.getElementById('balance');
	balanceContainer.style.visibility = 'visible';
	balanceContainer.innerText = `Target Wallet Balance\nUSD Amount: $${balance[1].toFixed(2)}\nBTC Amount: ${balance[0]}`;

	// populate transaction data
	const transactionsContainer = document.getElementById('transactions-list');
	transactionsContainer.innerHTML = '';

	transactions.forEach(tx => {
		const txElement = document.createElement('div');
		txElement.classList.add('transaction');
		//txElement.classList.add(`edge-${tx.from}-${tx.to}`);
		txElement.id = `edge-${tx.from}-${tx.to}`;

		const fromElement = document.createElement('p');
		fromElement.textContent = `From: ${tx.from}`;
		txElement.appendChild(fromElement);

		const toElement = document.createElement('p');
		toElement.textContent = `To: ${tx.to}`;
		txElement.appendChild(toElement);

		const btcAmountElement = document.createElement('p');
		btcAmountElement.textContent = `BTC Amount: ${tx.btcAmount}`;
		txElement.appendChild(btcAmountElement);

		const usdAmountElement = document.createElement('p');
		usdAmountElement.textContent = `USD Amount: $${tx.usdAmount}`;
		txElement.appendChild(usdAmountElement);

		transactionsContainer.appendChild(txElement);
	});
}
