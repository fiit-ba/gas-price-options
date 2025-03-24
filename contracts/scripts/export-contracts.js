const fs = require('fs');
const path = require('path');

async function main() {
    // Get the artifacts (contains ABIs)
    const GasOptionPricing = require('../artifacts/contracts/GasOptionPricing.sol/GasOptionPricing.json');
    const OptionFactory = require('../artifacts/contracts/OptionFactory.sol/OptionFactory.json');

    // Load deployed addresses from the deployment file
    const deployments = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../ignition/deployments/chain-31337/deployed_addresses.json'), 'utf8')
    );

    // Create export object with addresses and ABIs
    const contracts = {
        GasOptionPricing: {
            address: deployments['GasOptionsModule#GasOptionPricing'],
            abi: GasOptionPricing.abi
        },
        OptionFactory: {
            address: deployments['GasOptionsModule#OptionFactory'],
            abi: OptionFactory.abi
        }
    };

    // Update the path to export to frontend directory
    const frontendDir = path.join(__dirname, '../../frontend/src/contracts');
    if (!fs.existsSync(frontendDir)) {
        fs.mkdirSync(frontendDir, { recursive: true });
    }

    // Write to frontend location
    fs.writeFileSync(
        path.join(frontendDir, 'contracts.json'),
        JSON.stringify(contracts, null, 2)
    );

    console.log('Exported contract addresses and ABIs to src/contracts/contracts.json');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 