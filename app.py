import requests
import re
import base58
import time
import threading
from flask import Flask, render_template, jsonify

app = Flask(__name__)

###############
### GLOBALS ###
###############
# For proxy, use the following command:
#     ssh -D 8080 -i /path/to/privkey user@ip
proxies = None # Uncomment for no proxy
#proxies = {'http':'socks5h://localhost:8080','https':'socks5h://localhost:8080'} # Uncomment to use socks proxy

# global to store btc_exchange_rate, to be updated by threading task
btc_exchange_rate = 0
# accompanying thread lock for access to btc_exchange_rate
lock = threading.Lock()

###############
### THREADS ###
###############
def update_btc_rate_thread():
	while True:
		global btc_exchange_rate
		try:
			url = "https://api.coindesk.com/v1/bpi/currentprice/BTC.json"
			if(proxies == None):
				response = requests.get(url)
			else:
				response = requests.get(url, proxies=proxies)
			with lock:
				btc_exchange_rate = response.json()['bpi']['USD']['rate_float']
			print(f"[+] Got new BTC exchange rate: {btc_exchange_rate}")
		except requests.RequestException as e:
			print(f"[!] Error fetching BTC exchange rate: {e}")
		time.sleep(180)

def start_thread_tasks():
	thread = threading.Thread(target = update_btc_rate_thread)
	thread.daemon = True
	thread.start()

#########################
### UTILITY FUNCTIONS ###
#########################
# Validate btc address
def check_bitcoin_address(address):
	if address.startswith("1") or address.startswith("3"):
		try:
			decoded = base58.b58decode_check(address)
			# Check if the length of the decoded address is 25 bytes
			if(len(decoded) == 25):
				print(f"[+] Found valid base58 address: {address}")
				return True
			else:
				print(f"[-] Found invalid base58 address: {address}")
				return False
		except Exception:
			print(f"[!] Error in base58.b58decode_check")
			return False

	elif address.startswith("bc1"):
		bech32_regex = re.compile(r"^(bc1)[0-9a-z]{25,39}$")
		if(bool(bech32_regex.match(address))):
			print(f"[+] Found valid bech32 address: {address}")
			return True
		else:
			print(f"[-] Found invalid bech32 address: {address}")
			return False
	else:
		print(f"[-] Found invalid address: {address}")
		return False

# Function to get address details
def get_address_info(address):
	# check if address is valid:
	wallet_check = check_bitcoin_address(address)
	if(wallet_check == True):
		url = f"https://blockchain.info/rawaddr/{address}"
		print(f"[+] Requesting address info: {address}")
		if(proxies == None):
			response = requests.get(url)
		else:
			response = requests.get(url, proxies=proxies)
		#response = requests.get(url)
		return response.json()
	else:
		return None

# Function to get transaction details
def get_transaction_info(tx_hash):
	try:
		url = f"https://blockchain.info/rawtx/{tx_hash}"
		print(f"[+] Requesting transaction info: {tx_hash}")
		if(proxies == None):
			response = requests.get(url)
		else:
			response = requests.get(url, proxies=proxies)
		#response = requests.get(url)
		return response.json()
	except requests.RequestException as e:
		print(f"[!] Error fetching transaction data: {e}")
		return None


# Get balance of wallets
def get_wallet_balance(wallet_address):
	# Construct wallets

	try:
		url = f"https://blockchain.info/q/addressbalance/{wallet_address}"
		print(f"[+] Requesting multi-wallet info: {wallet_address}")
		if(proxies == None):
			response = requests.get(url)
		else:
			response = requests.get(url, proxies=proxies)
		#response = requests.get(url)
		response.raise_for_status()  # Raise an exception for HTTP errors

		# The balance is provided in satoshis (1 BTC = 100,000,000 satoshis)
		balance_satoshis = int(response.text)
		balance_btc = balance_satoshis / 1e8

		return balance_btc
	except requests.RequestException as e:
		print(f"[!] Error fetching wallet balance: {e}")
		return None

##################
### APP ROUTES ###
##################
@app.route("/")
def index():
	return render_template('index.html')

@app.route('/btc_rate', methods=['GET'])
def btc_exchange_rate():
	try:
		return jsonify(btc_exchange_rate)
	except Exception as e:
		return jsonify({"error": str(e)}), 500

@app.route('/transaction/<tx_hash>', methods=['GET'])
def transaction_info(tx_hash):
	try:
		transaction_info = get_transaction_info(tx_hash)
		return jsonify(transaction_info)
	except Exception as e:
		return jsonify({"error": str(e)}), 500

@app.route('/wallet/<address>', methods=['GET'])
def wallet_info(address):
	try:
		address_info = get_address_info(address)
		return jsonify(address_info)
	except Exception as e:
		return jsonify({"error": str(e)}), 500

@app.route('/wallet/transactions/<address>', methods=['GET'])
def wallet_transactions(address):
	try:
		address_info = get_address_info(address)
		transactions = []
		for tx in address_info['txs']:
			tx_info = get_transaction_info(tx['hash'])
			tx_info['btc_to_usd_rate'] = btc_exchange_rate
			transactions.append(tx_info)
		return jsonify(transactions)
	except Exception as e:
		return jsonify({"error": str(e)}), 500

@app.route('/wallet/balance/<address>', methods=['GET'])
def wallet_balance(address):
	try:
		balance = []
		btc_balance = get_wallet_balance(address)
		usd_balance = btc_balance * btc_exchange_rate
		balance.append(btc_balance)
		balance.append(usd_balance)
		return(jsonify(balance))
	except Exception as e:
		return jsonify({"error": str(e)}), 500

########################
### BACKGROUND LOGIC ###
########################
start_thread_tasks()
