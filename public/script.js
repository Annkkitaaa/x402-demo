// Configuration
const SERVER_URL = 'http://localhost:3402';
let wallet = null;

// Connect wallet with private key
async function connectWallet() {
    const privateKey = document.getElementById('privateKey').value.trim();

    if (!privateKey) {
        alert('Please enter your private key');
        return;
    }

    try {
        // Create wallet from private key
        wallet = new ethers.Wallet(privateKey);

        // Show wallet info
        document.getElementById('walletAddress').textContent = wallet.address;
        document.getElementById('walletInfo').classList.remove('hidden');

        // Store private key in session (only for demo!)
        sessionStorage.setItem('privateKey', privateKey);

        showNotification('Wallet connected successfully!', 'success');
    } catch (error) {
        console.error('Error connecting wallet:', error);
        showNotification('Invalid private key', 'error');
    }
}

// Check if wallet is already connected
window.addEventListener('DOMContentLoaded', () => {
    const storedKey = sessionStorage.getItem('privateKey');
    if (storedKey) {
        document.getElementById('privateKey').value = storedKey;
        connectWallet();
    }
});

// Access content with x402 payment
async function accessContent(endpoint, contentId) {
    // Check wallet connection
    if (!wallet) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }

    const resultDiv = document.getElementById(`content-${contentId}`);
    const button = event.target;
    button.disabled = true;
    button.textContent = 'Processing...';

    // Show flow section
    const flowSection = document.getElementById('flowSection');
    flowSection.classList.remove('hidden');
    resetFlowSteps();

    try {
        // Step 1: Make initial request
        activateStep(1);
        await sleep(500);

        console.log(`[Client] Making request to ${endpoint}`);
        const initialResponse = await fetch(`${SERVER_URL}${endpoint}`);

        if (initialResponse.status !== 402) {
            // No payment required (free content)
            completeStep(1);
            activateStep(5);
            const data = await initialResponse.json();
            displayContent(resultDiv, data, null);
            button.textContent = 'Access Now';
            button.disabled = false;
            return;
        }

        completeStep(1);

        // Step 2: Receive 402 Payment Required
        activateStep(2);
        await sleep(500);

        const paymentRequired = await initialResponse.json();
        console.log('[Client] Received payment requirements:', paymentRequired);

        if (!paymentRequired.accepts || paymentRequired.accepts.length === 0) {
            throw new Error('No payment options available');
        }

        const requirement = paymentRequired.accepts[0];
        const amountInUSDC = formatAmount(requirement.maxAmountRequired);

        showNotification(`Payment required: ${amountInUSDC} USDC`, 'info');
        completeStep(2);

        // Step 3: Create payment authorization
        activateStep(3);
        await sleep(800);

        console.log('[Client] Creating payment authorization...');
        const paymentHeader = await createPayment(wallet, requirement);
        console.log('[Client] Payment created successfully');

        completeStep(3);

        // Step 4: Submit payment
        activateStep(4);
        await sleep(500);

        console.log('[Client] Submitting request with payment...');
        const paidResponse = await fetch(`${SERVER_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'X-PAYMENT': paymentHeader,
                'Content-Type': 'application/json',
            },
        });

        if (!paidResponse.ok) {
            const errorData = await paidResponse.json();
            throw new Error(errorData.error || 'Payment failed');
        }

        completeStep(4);

        // Step 5: Access granted
        activateStep(5);
        await sleep(500);

        const responseData = await paidResponse.json();
        console.log('[Client] Content received:', responseData);

        displayContent(resultDiv, responseData, requirement);

        if (responseData.payment) {
            displayTransaction(responseData.payment, amountInUSDC);
        }

        completeStep(5);
        showNotification('Payment successful! Content unlocked.', 'success');

    } catch (error) {
        console.error('[Client] Error:', error);
        showNotification(`Error: ${error.message}`, 'error');
        resultDiv.innerHTML = `<div class="error"><strong>Error:</strong> ${error.message}</div>`;
        resultDiv.classList.remove('hidden');
    } finally {
        button.textContent = endpoint === '/public' ? 'Access Now' : 'Pay & Access';
        button.disabled = false;
    }
}

// Create payment using EIP-3009
async function createPayment(wallet, requirement) {
    const now = Math.floor(Date.now() / 1000);

    // Create EIP-3009 payload
    const eip3009Payload = {
        from: wallet.address,
        to: requirement.payTo,
        value: requirement.maxAmountRequired,
        validAfter: now - 60,
        validBefore: now + requirement.maxTimeoutSeconds,
        nonce: requirement.nonce || `0x${Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join('')}`,
        signature: '',
    };

    // Create EIP-712 domain
    const domain = {
        name: requirement.extra?.name || 'USD Coin',
        version: requirement.extra?.version || '2',
        chainId: getChainId(requirement.network),
        verifyingContract: requirement.asset,
    };

    // Define EIP-3009 types
    const types = {
        TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
        ],
    };

    // Create message
    const message = {
        from: eip3009Payload.from,
        to: eip3009Payload.to,
        value: eip3009Payload.value,
        validAfter: eip3009Payload.validAfter,
        validBefore: eip3009Payload.validBefore,
        nonce: eip3009Payload.nonce,
    };

    // Sign the message
    const signature = await wallet.signTypedData(domain, types, message);
    eip3009Payload.signature = signature;

    // Create payment payload
    const paymentPayload = {
        x402Version: 1,
        scheme: requirement.scheme,
        network: requirement.network,
        payload: eip3009Payload,
    };

    // Encode as base64
    const paymentJson = JSON.stringify(paymentPayload);
    const paymentHeader = btoa(paymentJson);

    return paymentHeader;
}

// Display content
function displayContent(div, data, requirement) {
    div.classList.remove('hidden');

    let html = '<div style="margin-bottom: 12px;">';
    html += '<strong style="color: var(--success-color);">✓ Access Granted</strong>';
    html += '</div>';

    if (requirement) {
        const amount = formatAmount(requirement.maxAmountRequired);
        html += `<div style="margin-bottom: 12px; color: var(--text-secondary);">`;
        html += `Paid: ${amount} USDC`;
        html += '</div>';
    }

    html += '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
    div.innerHTML = html;
}

// Display transaction info
function displayTransaction(payment, amount) {
    const section = document.getElementById('transactionSection');
    const info = document.getElementById('transactionInfo');

    let html = '';
    html += `<p><strong>Amount:</strong> ${amount} USDC</p>`;
    html += `<p><strong>Network:</strong> ${payment.network || 'base-sepolia'}</p>`;

    if (payment.txHash) {
        html += `<p><strong>Transaction Hash:</strong><br>`;
        html += `<code>${payment.txHash}</code></p>`;

        if (payment.explorer) {
            html += `<p><a href="${payment.explorer}" target="_blank">View on Block Explorer →</a></p>`;
        } else {
            html += `<p><a href="https://sepolia.basescan.org/tx/${payment.txHash}" target="_blank">View on Base Sepolia Explorer →</a></p>`;
        }
    }

    info.innerHTML = html;
    section.classList.remove('hidden');
}

// Flow step management
function resetFlowSteps() {
    for (let i = 1; i <= 5; i++) {
        const step = document.getElementById(`step${i}`);
        step.classList.remove('active', 'completed');
    }
}

function activateStep(stepNum) {
    const step = document.getElementById(`step${stepNum}`);
    step.classList.add('active');
}

function completeStep(stepNum) {
    const step = document.getElementById(`step${stepNum}`);
    step.classList.remove('active');
    step.classList.add('completed');
}

// Utility functions
function getChainId(network) {
    const chainIds = {
        'base-sepolia': 84532,
        'base': 8453,
        'ethereum': 1,
        'sepolia': 11155111,
    };
    return chainIds[network] || 1;
}

function formatAmount(amount) {
    const decimals = 6; // USDC has 6 decimals
    const value = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const integerPart = value / divisor;
    const fractionalPart = value % divisor;

    return `${integerPart}.${fractionalPart.toString().padStart(decimals, '0')}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showNotification(message, type) {
    // Simple notification - could be enhanced with a toast library
    const color = {
        success: 'var(--success-color)',
        error: 'var(--danger-color)',
        info: 'var(--primary-color)',
    }[type] || 'var(--text-secondary)';

    console.log(`[${type.toUpperCase()}] ${message}`);

    // You could add a toast notification here
    // For now, just using console logs
}
