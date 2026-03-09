Scripts to run smart Contracts: 
npm run contracts:hh -- --help
npm run contracts:compile
npm run contracts:test
npm run contracts:node
npm run contracts:deploy

For a specific network when deploying:
npm run contracts:deploy -- --network hardhatMainnet
npm run contracts:deploy -- --network sepolia
npm run contracts:node
npm run contracts:deploy

Run Simulator:
npm exec -w apps/contracts -- hardhat node
npm run contracts:deploy:local
npm run contracts:simulate -- normal 12345 --deploy --charts

npm run contracts:simulate -- normal 12345 --deploy --steps 1000 --charts
npm run contracts:simulate -- bullRun 12345 --deploy --steps 1000 --charts
npm run contracts:simulate -- bearMarket 12345 --deploy --steps 1000 --charts
npm run contracts:simulate -- bearRun 12345 --deploy --steps 1000 --charts
npm run contracts:simulate -- blackSwan 12345 --deploy --steps 1000 --charts
npm run contracts:simulate -- blackSwanUp 12345 --deploy --steps 1000 --charts
npm run contracts:simulate -- blackSwanDown 12345 --deploy --steps 1000 --charts