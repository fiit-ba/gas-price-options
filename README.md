# Gas Price Options

Proof-of-Concept implementation of "Hedging against High Ethereum Gas Prices with On-Chain Derivatives" by Adam Novocký, Changhoon Kang, Kristián Košťál, and James Won-Ki Hong. Accepted to IEEE International Conference on Blockchain and Cryptocurrency 2025.

A decentralized application for writing, buying, and exercising options tethered to the price of Ethereum gas. The main use case is to hedge against high future gas prices on Ethereum using a call option. The buyer purchases an option for a one-time premium calculated using the fractional Ornstein-Uhlenbeck process, and as parameters, it takes the gas price at the time of purchase, the number of blocks until the option expires, the strike price (price at which the option becomes profitable), and the number of contracts being purchased. One option contract is quoted as 100,000 gas. At the expiration block, the buyer can exercise the option if it is profitable (price at expiry if above strike price). As Ethereum generates new blocks on average every ~14 seconds, if the buyer fails or is unable to exerciseat expiry, a keeper can auto-exercise in the next block post-expiry for an arbitrary % fee (we used 10%).

The application should be deployed to Optimism Mainnet, as we leverage Optimism's L1BLock predeploy contract for a trustworthy source of Ethereum Mainnet gas price. Even the local Hardhat blockchain is forked from Optimism Mainnet to simulate the L2 environment. 


## Project Structure

The project is organized into a monorepo structure using npm workspaces:

-   `contracts/`: Contains the Hardhat project for the Solidity smart contracts.
    -   `contracts/`: Solidity source code for the options contracts.
    -   `ignition/`: Ignition modules for deploying contracts.
    -   `scripts/`: Deployment and utility scripts.
    -   `test/`: Tests for the smart contracts.
    -   `hardhat.config.js`: Hardhat configuration file.
    -   `package.json`: Node.js dependencies for the contracts project.
-   `frontend/`: Contains the React application for the user interface.
    -   `public/`: Static assets.
    -   `src/`: React components and application logic.
    -   `package.json`: Node.js dependencies for the frontend project.
-   `keeper/`: Contains the Node.js implementation for the keeper service (optional, not covered in setup).
-   `package.json`: Root package file defining workspaces and top-level scripts.
-   `README.md`: This file.

## Dependencies

-   **Node.js and npm:** Required for running scripts and managing dependencies.
-   **Hardhat:** Ethereum development environment used for compiling, testing, and deploying contracts.
-   **React:** JavaScript library for building the user interface.
-   **ethers.js:** Library for interacting with the Ethereum blockchain.
-   **Concurrent.ly:** Utility to run multiple npm scripts concurrently.

Dependencies for each sub-project (`contracts`, `frontend`) are listed in their respective `package.json` files.

## Setup and Running

Follow these steps to set up and run the contracts and the frontend locally.

**Prerequisites:** Ensure you have Node.js and npm installed.

1.  **Install Root Dependencies:**
    Navigate to the project root directory and install the dependencies for the workspaces.
    ```bash
    npm install
    ```

2.  **Compile Contracts:**
    Compile the smart contracts using Hardhat.
    ```bash
    npm run contracts:compile
    ```
    Alternatively, you can `cd contracts` and run `npx hardhat compile`.

3.  **Start Local Blockchain & Deploy Contracts:**
    This command starts a local Hardhat node and deploys the contracts to it using Hardhat Ignition. It also exports the contract ABIs and addresses for the frontend.
    ```bash
    # In one terminal
    npm run start:contracts

    # In another terminal, wait for the node to start, then run:
    npm run start:deploy
    ```
    
4.  **Install Frontend dependencies:**
    Navigate to the frontend directory and install dependencies.
    ```bash
    npm install
    ```

5.  **Start Frontend:**
    In the frontend directory start the React development server.
    ```bash
    npm start
    ```
    Alternatively, you can run `npm run start:frontend` from the root directory once dependencies are installed.

The frontend application should now be accessible in your browser (usually at `http://localhost:3000`), connected to the locally deployed contracts.

## Testing

**Contracts Tests:**
Run the Hardhat test suite for the smart contracts.
```bash
npm run contracts:test
```
To run only the pricing tests:
```bash
npm run contracts:test:pricing
```
Alternatively, you can `cd contracts` and run `npx hardhat test` or `npx hardhat test test/GasOptionPricing.test.js`.


