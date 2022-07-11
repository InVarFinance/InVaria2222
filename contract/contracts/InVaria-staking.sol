// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface BurnFunction{
    function BurnInVariaNFT(address burnTokenAddress,uint256 burnValue)external;
}

contract InVariaStaking is Ownable,ReentrancyGuard{
    BurnFunction public InVariaNFTBurn;
    IERC1155 public InVariaNFT;
    IERC20 public USDC;

    address public WithDrawAddress = 0xAcB683ba69202c5ae6a3B9b9b191075295b1c41C;

    struct StakingInfo{
        uint256 staketime;
        uint256 stakeNFTamount;
    }

    mapping(address => StakingInfo) public stakingInfo;
    mapping(address => uint256) private ClaimAmount;

    uint256 private unlockTime;
    uint256 private AprByMin = 1200 * 1e6;
    uint256 private BurnReturn = 10000 * 1e6;

    bool public BurnStart = false;

    constructor(address inVaria,address usdc){
       InVariaNFT =  IERC1155(inVaria);
       InVariaNFTBurn = BurnFunction(inVaria);
       USDC = IERC20(usdc);

       unlockTime = block.timestamp;
    }


    //view function
    function USDC_Balance() public view returns(uint256){
        return USDC.balanceOf(address(this));
    }

    // only Owner
     function setAddress(address inVaria,address usdc)external onlyOwner{
        InVariaNFTBurn = BurnFunction(inVaria);
        InVariaNFT = IERC1155(inVaria);
        USDC = IERC20(usdc);
    }

    function withDrawUSDC(uint256 bal)external onlyOwner{
        USDC.transfer(owner(),bal * 1e6);
    }


    function BurnStartSet(bool set)external onlyOwner{
        BurnStart = set;
    }

    //excute function

    function InputUSDC(uint256 balance) external {
        USDC.transferFrom(msg.sender,address(this),balance * 1e6);
    }


    function stakeNFT(uint256 bal)external{
        require(InVariaNFT.balanceOf(msg.sender, 1) >= bal ,"Invalid input balance");
        require(bal > 0 ,"Can't stake zero");
        ClaimAmount[msg.sender] += StakingReward_Balance(msg.sender);

        InVariaNFT.safeTransferFrom(msg.sender, address(this), 1, bal ,'');
        stakingInfo[msg.sender].stakeNFTamount += bal;
        stakingInfo[msg.sender].staketime = block.timestamp;

    }

    function unStake(uint256 bal) external nonReentrant{
        require(stakingInfo[msg.sender].stakeNFTamount >= bal,"You have not enought NFT staking");
         require(bal > 0 ,"Can't unstake zero");
        InVariaNFT.safeTransferFrom(address(this),msg.sender,1,bal,'');

        ClaimAmount[msg.sender] += StakingReward_Balance(msg.sender);

        stakingInfo[msg.sender].stakeNFTamount -= bal;
        stakingInfo[msg.sender].staketime = block.timestamp;

    }


    function withDraw() external nonReentrant{

        uint256 claimAmount = CheckClaimValue(msg.sender);
        require(claimAmount > 0 ,"You can't claim");

        stakingInfo[msg.sender].staketime = block.timestamp;

        ClaimAmount[msg.sender] = 0;

        USDC.transfer(msg.sender,claimAmount);

    }

    function BurnNFT(uint256 amount)external{
        require(InVariaNFT.balanceOf(msg.sender, 1) >= amount ,"Invalid input balance");
        require(BurnStart && amount > 0,"Burn not start yet");
        InVariaNFTBurn.BurnInVariaNFT(msg.sender,amount);

        USDC.transfer(msg.sender,BurnReturn * amount);
    }



    // count Reward
    function StakingReward_Balance(address stakingAddress)public view returns(uint256){
        uint256 balance = stakingInfo[stakingAddress].stakeNFTamount * (block.timestamp - stakingInfo[stakingAddress].staketime) * (AprByMin/31536000);
        return balance;
    }

    function CheckClaimValue(address user)public view returns(uint256){
        uint256 claimAmount = StakingReward_Balance(user) + ClaimAmount[user];
        return claimAmount;
    }



}