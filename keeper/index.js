const ethers = require('ethers');
require('dotenv').config();

const optionABI = require('../frontend/src/contracts/optionABI.json');
const contractsInfo = require('../frontend/src/contracts/contracts.json');
const L1BlockABI = require('./L1BlockABI.json');

// Configuration
const config = {
    providerUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    checkIntervalSeconds: 7, // How often to check the contract
};

class KeeperServer {
    constructor() {
        // Initialize provider and wallet
        this.provider = new ethers.providers.JsonRpcProvider(config.providerUrl);
        this.wallet = new ethers.Wallet(config.privateKey, this.provider);

        this.L1Block = new ethers.Contract(
            L1BlockABI.L1Block.contractAddress,
            L1BlockABI.L1Block.abi,
            this.provider
        );
        
        // Initialize contract
        this.factoryContract = new ethers.Contract(
            contractsInfo.OptionFactory.address,
            contractsInfo.OptionFactory.abi,
            this.wallet
        );

        this.optionsArray = []

        // Initialize state
        this.isRunning = false;
    }

    async initialize() {
        try {
            const balance = await this.wallet.getBalance();
            console.log(`Keeper wallet balance: ${ethers.utils.formatEther(balance)} ETH\nAddress: ${this.wallet.address}`);

            this.optionsArray = await this.factoryContract.getAllOptions();

            if (!this.optionsArray.length == 0) {
              console.log('Connected to Factory Contract');
              console.log('Options found:', this.optionsArray.length);
              return true;
            } else {
              throw new Error('No options found');
            }
            
        } catch (error) {
            console.error('Initialization failed:', error);
            return false;
        }
    }

    async checkExpiry() {

        const currentBlock = await this.L1Block.number();
        console.log('Current block:', currentBlock.toString());

        for (const option of this.optionsArray) {
            try {
                console.log('Checking option:', option);
                const optionContract = new ethers.Contract(
                    option,
                    optionABI.GasOption.abi,
                    this.wallet
                );

                const nextToExpire = await optionContract.getFirstToExpire();
                console.log('Next to expire:', nextToExpire.toString());

                if (currentBlock == nextToExpire+1) {
                    console.log('Option expired, exercising options in contract ', option);
                    await this.exerciseOption(optionContract);
                }


            } catch (error) {
                console.error('Error checking contract conditions:', error);
            }
        }
    }

    async exerciseOption(optionContract) {
        try {
            const tx = await optionContract.keeperSettle(
                {
                    gasLimit: ethers.utils.hexlify(500000) 
                }
            );
            
            console.log(`Transaction submitted: ${tx.hash}`);
            
            // Wait for transaction confirmation
            const receipt = await tx.wait();
            console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
        } catch (error) {
            console.error('Error performing action:', error);
        }
    }

    start() {
        if (this.isRunning) {
            console.log('Keeper is already running');
            return;
        }

        this.isRunning = true;
        console.log('Starting keeper service...');

        // Start the main loop
        this.interval = setInterval(
            () => this.checkExpiry(),
            config.checkIntervalSeconds * 1000
        );
    }

    stop() {
        if (!this.isRunning) {
            console.log('Keeper is not running');
            return;
        }

        clearInterval(this.interval);
        this.isRunning = false;
        console.log('Keeper service stopped');
    }
}

// Initialize and start the keeper
const keeper = new KeeperServer();

async function main() {
    const initialized = await keeper.initialize();
    if (initialized) {
        keeper.start();
    } else {
        console.error('Failed to initialize keeper');
        process.exit(1);
    }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
    console.log('Shutting down keeper...');
    keeper.stop();
    process.exit(0);
});

main().catch(console.error);