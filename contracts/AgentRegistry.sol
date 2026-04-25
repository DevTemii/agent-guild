// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    address public owner;

    struct Agent {
        address owner;
        string name;
        string description;
        string skill;
        uint256 hourlyRate;
        string location;
        string availability;
    }

    Agent[] public agents;
    mapping(address => bool) public betaAllowed;
    mapping(address => bool) public hasRegisteredProfile;

    event BetaAccessUpdated(address indexed wallet, bool allowed);
    event AgentRegistered(address indexed owner, uint256 indexed agentId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can manage beta access.");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setBetaAccess(address wallet, bool allowed) public onlyOwner {
        require(wallet != address(0), "Wallet is required.");
        betaAllowed[wallet] = allowed;
        emit BetaAccessUpdated(wallet, allowed);
    }

    function registerAgent(
        string memory _name,
        string memory _description,
        string memory _skill,
        uint256 _hourlyRate,
        string memory _location,
        string memory _availability
    ) public {
        require(!hasRegisteredProfile[msg.sender], "Wallet already has a profile.");

        agents.push(
            Agent(
                msg.sender,
                _name,
                _description,
                _skill,
                _hourlyRate,
                _location,
                _availability
            )
        );

        hasRegisteredProfile[msg.sender] = true;
        emit AgentRegistered(msg.sender, agents.length - 1);
    }

    function getAgents() public view returns (Agent[] memory) {
        return agents;
    }
}
