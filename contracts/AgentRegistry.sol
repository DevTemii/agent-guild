// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
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

    function registerAgent(
        string memory _name,
        string memory _description,
        string memory _skill,
        uint256 _hourlyRate,
        string memory _location,
        string memory _availability
    ) public {
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
    }

    function getAgents() public view returns (Agent[] memory) {
        return agents;
    }
}