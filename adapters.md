hmm, what's the responsibility of an adapter? I think it mainly allows to create experiences and show reputation scores in the context of a website. E.g. it injects little tool tip when hovering ethereum addresses on etherscan. You need a separate adapter for two separate websites even if both use the same ethereum addresses as ids. Both would use the same id domain (ethereum) but the integration (creating experiences and showing scores) would differ. 

Since adapters share ID domains, ID domains should be implemented in separate packages. 

So, there are adapters: handle websites.  

okaayy, yea, but let's keep the id domain libaries separate from the core client library 
implementation as you suggested earlier. What's your suggestion how to handle open source 
implementation of adapters? adapters are the components that inject trust scores onto a certain 
website and help with the creation of experiences (e.g. by automatically prompting user to give a 
review after a week and helping with the economic value estimation)

-

Okay... 

