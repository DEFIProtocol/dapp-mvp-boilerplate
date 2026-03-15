


1.) In funding : /// Need to fix (long exposure - short exposure) / total exposure ( its a resonable approximation )


2....) Need to add auto Deleveraging. 

3....) Add TwAP

    My system: markPrice = riskManager.getMarkPrice()
    Most Production Systems: 
    Index price = oracle
    Mark price = TWAP(index + funding basis)
        Chainlink price
        +
        DEX TWAP
        +
        CEX median

4......) Position Netting - new position every trade(add to position, reduce)

5.) Funding Rate weakness:
    My contract: 
        imbalance = (long - short) / total
        rate = imbalance × maxRate
    Typicatl Formula:
        funding = (markPrice - indexPrice) / indexPrice

6....) Apparently partial liquidations need to be added. 

7.) Prevent trades far from Oracle: maxDeviation = 5%.

8.) Circuit Breakers(pause if price moves to fast), liquidation throttleing(avoid cascades), and order size limits(prevent whale manipulation).

9.)Keeper Infrastructure 
    my system: requires external actors
        updateFunding()
        liquidate()
    Production system:
        keeper incentives(without funding stops, liquidations stall)

10.) Withdraw safely: 
    post-withdraw margin ratio(check margin after withdraw to make sure trade isn't undercollaterlized)

11.) Rate Limits /Anti DOS
    max positions per account
    max open orders
    max leverage

12.) Also Need: 
    Production protocols require:
    parameter governance
    emergency pause
    oracle replacement
    insurance refill

13.) Liquidation Price Caching: To reduce gas you typically store(in position struct):
    liquidationPrice
    bankruptcyPrice

14.) Order Types Missing?:
    But users expect:
    market orders
    stop losses
    take profit
    reduce-only
    post-only

15.) Trade Matching Attack:
    I have:
        keccak(longHash, shortHash, timestamp)
    production:
        keccak(longHash, shortHash, fillNonce)

