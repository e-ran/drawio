/**
 * Copyright (c) 2006-2017, JGraph Ltd
 * Copyright (c) 2006-2017, Gaudenz Alder
 */
GitHubClient = function(editorUi)
{
	DrawioClient.call(this, editorUi, 'ghauth');
};

// Extends DrawioClient
mxUtils.extend(GitHubClient, DrawioClient);

/**
 * Specifies if thumbnails should be enabled. Default is true.
 * LATER: If thumbnails are disabled, make sure to replace the
 * existing thumbnail with the placeholder only once.
 */
GitHubClient.prototype.clientId = (window.location.hostname == 'test.draw.io') ? '23bc97120b9035515661' : '89c9e4624ca416554489';

/**
 * OAuth scope.
 */
GitHubClient.prototype.scope = 'repo';

/**
 * Default extension for new files.
 */
GitHubClient.prototype.extension = '.xml';

/**
 * Base URL for API calls.
 */
GitHubClient.prototype.baseUrl = 'https://api.github.com';

/**
 * Maximum file size of the GitHub REST API.
 */
GitHubClient.prototype.maxFileSize = 1000000 /*1MB*/;

/**
 * Authorizes the client, gets the userId and calls <open>.
 */
GitHubClient.prototype.updateUser = function(success, error)
{
	var fn = mxUtils.bind(this, function()
	{
		var acceptResponse = true;
		
		var timeoutThread = window.setTimeout(mxUtils.bind(this, function()
		{
			acceptResponse = false;
			error({code: App.ERROR_TIMEOUT, retry: fn});
		}), this.ui.timeout);
		
		mxUtils.get(this.baseUrl + '/user?access_token=' + this.token, mxUtils.bind(this, function(userReq)
		{
			window.clearTimeout(timeoutThread);
			
			if (acceptResponse)
			{
				if (userReq.getStatus() === 401)
				{
					this.authorizeRequest(fn, error);
				}
				else if (userReq.getStatus() < 200 || userReq.getStatus() >= 300)
				{
					error({message: mxResources.get('accessDenied')});
				}
				else
				{
					var userInfo = JSON.parse(userReq.getText());
					this.setUser(new DrawioUser(userInfo.id, userInfo.email, userInfo.name));
					success();
				}
			}
		}));
	});
	
	fn();
};

/**
 * Authorizes the client, gets the userId and calls <open>.
 */
GitHubClient.prototype.authorizeRequest = function(success, error)
{
	this.ui.showAuthDialog(this, true, mxUtils.bind(this, function(remember, authSuccess)
	{
		// Initializes oauth flow
		window.open('https://github.com/login/oauth/authorize?client_id=' +
			this.clientId + '&scope=' + this.scope, 'oauth');
		
		window.onGitHubCallback = mxUtils.bind(this, function(code, authWindow)
		{
			window.onGitHubCallback = null;

			// Gets token for code via servlet
			var fn = mxUtils.bind(this, function()
			{
				var acceptResponse = true;
				
				var timeoutThread = window.setTimeout(mxUtils.bind(this, function()
				{
					acceptResponse = false;
					error({code: App.ERROR_TIMEOUT, retry: fn});
				}), this.ui.timeout);
				
				mxUtils.get('/github?client_id=' + this.clientId + '&code=' + code, mxUtils.bind(this, function(authReq)
				{
					window.clearTimeout(timeoutThread);
					
					if (acceptResponse)
					{
						try
						{
							if (authWindow != null)
							{
								authWindow.close();
							}
	
							if (authReq.getStatus() < 200 || authReq.getStatus() >= 300)
							{
								error({message: mxResources.get('cannotLogin')});
							}
							else
							{
								if (authSuccess != null)
								{
									authSuccess();
								}
								
								var res = authReq.getText();
								this.token = res.substring(res.indexOf('=') + 1, res.indexOf('&'));
								
								if (remember)
								{
									this.setPersistentToken(this.token);
								}
								
								success();
							}
						}
						catch (e)
						{
							error(e);
						}
					}
				}));
			});
			
			fn();
		});
	}));
};

/**
 * Authorizes the client, gets the userId and calls <open>.
 */
GitHubClient.prototype.executeRequest = function(req, success, error)
{
	var doExecute = mxUtils.bind(this, function()
	{
		var acceptResponse = true;
		
		var timeoutThread = window.setTimeout(mxUtils.bind(this, function()
		{
			acceptResponse = false;
			error({code: App.ERROR_TIMEOUT, retry: fn});
		}), this.ui.timeout);
		
		var temp = this.token;
		
		req.setRequestHeaders = function(request, params)
		{
			request.setRequestHeader('Authorization', 'token ' + temp);
		};
		
		req.send(mxUtils.bind(this, function()
		{
			window.clearTimeout(timeoutThread);
			
			if (acceptResponse)
			{
				if (req.getStatus() >= 200 && req.getStatus() <= 299)
				{
					success(req);
				}
				else if (req.getStatus() === 401)
				{
					this.authorizeRequest(fn, error);
				}
				else if (req.getStatus() === 403)
				{
					var tooLarge = false;
					
					try
					{
						var temp = JSON.parse(req.getText());
						
						if (temp != null && temp.errors != null && temp.errors.length > 0)
						{
							tooLarge = temp.errors[0].code == 'too_large';
						}
					}
					catch (e)
					{
						// ignore
					}
					
					error({message: mxResources.get((tooLarge) ? 'drawingTooLarge' : 'forbidden')});
				}
				else if (req.getStatus() === 404)
				{
					error({message: mxResources.get('fileNotFound')});
				}
				else if (req.getStatus() === 409)
				{
					// Special case: flag to the caller that there was a conflict
					error({status: 409});
				}
				else
				{
					error({message: mxResources.get('error') + ' ' + req.getStatus()});
				}
			}
		}), error);
	});
	
	var fn = mxUtils.bind(this, function()
	{
		if (this.user == null)
		{
			this.updateUser(doExecute, error);
		}
		else
		{
			doExecute();
		}
	});

	if (this.token === null)
	{
		this.authorizeRequest(fn, error);
	}
	else
	{
		fn();
	}
};

/**
 * Checks if the client is authorized and calls the next step.
 */
GitHubClient.prototype.getLibrary = function(path, success, error)
{
	this.getFile(path, success, error, true);
};

/**
 * Checks if the client is authorized and calls the next step.
 */
GitHubClient.prototype.getFile = function(path, success, error, asLibrary)
{
	asLibrary = (asLibrary != null) ? asLibrary : false;
	
	var tokens = path.split('/');
	var org = tokens[0];
	var repo = tokens[1];
	var ref = tokens[2];
	var path = tokens.slice(3, tokens.length).join('/');
	
	// Handles .vsdx, Gliffy and PNG+XML files by creating a temporary file
	if (/\.vsdx$/i.test(path) || /\.gliffy$/i.test(path) || /\.png$/i.test(path))
	{
		// Should never be null
		if (this.token != null)
		{
			var url = this.baseUrl + '/repos/' + org + '/' + repo +
				'/contents/' + path + '?ref=' + encodeURIComponent(ref) +
				'&token=' + this.token;
			var tokens = path.split('/');
			var name = (tokens.length > 0) ? tokens[tokens.length - 1] : path;
	
			this.ui.convertFile(url, name, null, this.extension, success, error);
		}
		else if (error != null)
		{
			error();
		}
	}
	else
	{
		var req = new mxXmlRequest(this.baseUrl + '/repos/' + org + '/' + repo +
			'/contents/' + path + '?ref=' + encodeURIComponent(ref), null, 'GET');
		
		this.executeRequest(req, mxUtils.bind(this, function(req)
		{
			try
			{
				success(this.createGitHubFile(org, repo, ref, JSON.parse(req.getText()), asLibrary));
			}
			catch (e)
			{
				if (error != null)
				{
					error(e);
				}
			}
		}), error);
	}
};

/**
 * Translates this point by the given vector.
 * 
 * @param {number} dx X-coordinate of the translation.
 * @param {number} dy Y-coordinate of the translation.
 */
GitHubClient.prototype.createGitHubFile = function(org, repo, ref, data, asLibrary)
{
	var meta = {'org': org, 'repo': repo, 'ref': ref, 'name': data.name,
		'path': data.path, 'sha': data.sha, 'html_url': data.html_url,
		'download_url': data.download_url};
	var content = data.content;
	
	if (data.encoding === 'base64')
	{
		content = Base64.decode(content);
	}
	
	return (asLibrary) ? new GitHubLibrary(this.ui, content, meta) : new GitHubFile(this.ui, content, meta);
};

/**
 * Translates this point by the given vector.
 * 
 * @param {number} dx X-coordinate of the translation.
 * @param {number} dy Y-coordinate of the translation.
 */
GitHubClient.prototype.insertLibrary = function(filename, data, success, error, folderId)
{
	this.insertFile(filename, data, success, error, true, folderId, false);
};

/**
 * Translates this point by the given vector.
 * 
 * @param {number} dx X-coordinate of the translation.
 * @param {number} dy Y-coordinate of the translation.
 */
GitHubClient.prototype.insertFile = function(filename, data, success, error, asLibrary, folderId, base64Encoded)
{
	asLibrary = (asLibrary != null) ? asLibrary : false;

	var tokens = folderId.split('/');
	var org = tokens[0];
	var repo = tokens[1];
	var ref = tokens[2];
	var path = tokens.slice(3, tokens.length).join('/');

	if (path.length > 0)
	{
		path = path + '/';
	}
	
	path = path + filename;

	this.checkExists(org + '/' + repo + '/' + ref + '/' + path, true, mxUtils.bind(this, function(checked, sha)
	{
		if (checked)
		{
			// Does not insert file here as there is another writeFile implicit via fileCreated
			if (!asLibrary)
			{
				success(new GitHubFile(this.ui, data, {'org': org, 'repo': repo, 'ref': ref,
					'name': filename, 'path': path, 'sha': sha, isNew: true}));
			}
			else
			{
				if (!base64Encoded)
				{
					data = Base64.encode(data);
				}
				
				this.showCommitDialog(filename, true, mxUtils.bind(this, function(message)
				{
					this.writeFile(org, repo, ref, path, message, data, sha, mxUtils.bind(this, function(req)
					{
						try
						{
							var msg = JSON.parse(req.getText());
							success(this.createGitHubFile(org, repo, ref, msg.content, asLibrary));
						}
						catch (e)
						{
							if (error != null)
							{
								error(e);
							}
						}
					}), error);
				}), mxUtils.bind(this, function()
				{
					if (error != null)
					{
						error();
					}
				}));
			}
		}
		else if (error != null)
		{
			error();
		}
	}))
};

/**
 * 
 */
GitHubClient.prototype.showCommitDialog = function(filename, isNew, success, cancel)
{
	// Pauses spinner while commit message dialog is shown
	var resume = this.ui.spinner.pause();
	
	var dlg = new FilenameDialog(this.ui, mxResources.get((isNew) ? 'addedFile' : 'updateFile',
		[filename]), mxResources.get('ok'), mxUtils.bind(this, function(message)
	{
		resume();
		success(message);
	}), mxResources.get('commitMessage'), null, null, null, null, mxUtils.bind(this, function()
	{
		cancel();
	}));
	this.ui.showDialog(dlg.container, 300, 80, true, false);
	dlg.init();
};

/**
 * 
 */
GitHubClient.prototype.writeFile = function(org, repo, ref, path, message, data, sha, success, error)
{
	if (data.length >= this.maxFileSize)
	{
		if (error != null)
		{
			error({message: mxResources.get('drawingTooLarge') + ' (' +
				this.ui.formatFileSize(data.length) + ' / 1 MB)'});
		}
	}
	else
	{
		var entity =
		{
			path: path,
			message: message,
			content: data
		};
		
		if (sha != null)
		{
			entity.sha = sha;
		}
		
		var req = new mxXmlRequest(this.baseUrl + '/repos/' + org + '/' + repo +
			'/contents/' + path + '?ref=' + encodeURIComponent(ref),
			JSON.stringify(entity), 'PUT');
		
		this.executeRequest(req, mxUtils.bind(this, function(req)
		{
			success(req);
		}), error);
	}
};

/**
 * Translates this point by the given vector.
 * 
 * @param {number} dx X-coordinate of the translation.
 * @param {number} dy Y-coordinate of the translation.
 */
GitHubClient.prototype.checkExists = function(path, askReplace, fn)
{
	this.getFile(path, mxUtils.bind(this, function(file)
	{
		if (askReplace && file.meta != null)
		{
			var resume = this.ui.spinner.pause();
			
			this.ui.confirm(mxResources.get('replaceIt', [path]), function()
			{
				resume();
				fn(true, file.meta.sha);
			}, function()
			{
				resume();
				fn(false);
			});
		}
		else
		{
			this.ui.spinner.stop();
			
			this.ui.showError(mxResources.get('error'), mxResources.get('fileExists'), mxResources.get('ok'), function()
			{
				fn(false);						
			});
		}
	}), mxUtils.bind(this, function(err)
	{
		fn(true);
	}));
};

/**
 * Translates this point by the given vector.
 * 
 * @param {number} dx X-coordinate of the translation.
 * @param {number} dy Y-coordinate of the translation.
 */
GitHubClient.prototype.saveFile = function(file, success, error)
{
	var org = file.meta.org;
	var repo = file.meta.repo;
	var ref = file.meta.ref;
	var path = file.meta.path;
	
	this.showCommitDialog(file.meta.name, file.meta.sha == null || file.meta.isNew, mxUtils.bind(this, function(message)
	{
		var data = Base64.encode(file.getData());
		
		var fn = mxUtils.bind(this, function(sha)
		{
			this.writeFile(org, repo, ref, path, message, data, sha, mxUtils.bind(this, function(req)
			{
				delete file.meta.isNew;
				success(JSON.parse(req.getText()));
			}), mxUtils.bind(this, function(err)
			{
				// Handles special conflict case where overwrite needs an update of the sha
				if (err != null && err.status == 409)
				{
					resume = this.ui.spinner.pause();
					
					var dlg = new ErrorDialog(this.ui, mxResources.get('errorSavingFile'),
						mxResources.get('fileChangedOverwrite'), mxResources.get('cancel'), mxUtils.bind(this, function()
						{
							error();
						}), null, mxResources.get('overwrite'), mxUtils.bind(this, function()
						{
							resume();
							
							// Gets the latest sha and tries again
							this.getFile(org + '/' + repo + '/' + ref + '/' + path, mxUtils.bind(this, function(tempFile)
							{
								fn(tempFile.meta.sha);
							}));
						}));
					this.ui.showDialog(dlg.container, 340, 150, true, false);
					dlg.init();
				}
				else
				{
					error(err);
				}
			}));
		});
		
		fn(file.meta.sha);
	}), mxUtils.bind(this, function()
	{
		error();
	}));
};

/**
 * Checks if the client is authorized and calls the next step.
 */
GitHubClient.prototype.pickLibrary = function(fn)
{
	this.pickFile(fn);
};

/**
 * Checks if the client is authorized and calls the next step.
 */
GitHubClient.prototype.pickFolder = function(fn)
{
	this.showGitHubDialog(false, fn);
};

/**
 * Checks if the client is authorized and calls the next step.
 */
GitHubClient.prototype.pickFile = function(fn)
{
	fn = (fn != null) ? fn : mxUtils.bind(this, function(path)
	{
		this.ui.loadFile('H' + encodeURIComponent(path));
	});
	
	this.showGitHubDialog(true, fn);
};

/**
 * 
 */
GitHubClient.prototype.showGitHubDialog = function(showFiles, fn)
{
	var org = null;
	var repo = null;
	var ref = null;
	var path = null;
	
	var content = document.createElement('div');
	content.style.whiteSpace = 'nowrap';
	content.style.overflow = 'hidden';
	content.style.height = '224px';

	var hd = document.createElement('h3');
	mxUtils.write(hd, mxResources.get((showFiles) ? 'selectFile' : 'selectFolder'));
	hd.style.cssText = 'width:100%;text-align:center;margin-top:0px;margin-bottom:12px';
	content.appendChild(hd);

	var div = document.createElement('div');
	div.style.whiteSpace = 'nowrap';
	div.style.overflow = 'auto';
	div.style.height = '194px';
	content.appendChild(div);

	var dlg = new CustomDialog(this.ui, content, mxUtils.bind(this, function()
	{
		fn(org + '/' + repo + '/' + ref + '/' + path);
	}));
	this.ui.showDialog(dlg.container, 340, 270, true, true);
	
	if (showFiles)
	{
		dlg.okButton.parentNode.removeChild(dlg.okButton);
	}
	
	var createLink = mxUtils.bind(this, function(label, fn)
	{
		var link = document.createElement('a');
		link.setAttribute('href', 'javascript:void(0);');
		mxUtils.write(link,  label);
		mxEvent.addListener(link, 'click', fn);
		
		return link;
	});
	
	var updatePathInfo = mxUtils.bind(this, function(hideRef)
	{
		var pathInfo = document.createElement('div');
		pathInfo.style.marginBottom = '8px';
		
		pathInfo.appendChild(createLink(org + '/' + repo, mxUtils.bind(this, function()
		{
			path = null;
			selectRepo();
		})));
		
		if (!hideRef)
		{
			mxUtils.write(pathInfo, ' / ');
			pathInfo.appendChild(createLink(ref, mxUtils.bind(this, function()
			{
				path = null;
				selectRef();
			})));
		}
		
		if (path != null && path.length > 0)
		{
			var tokens = path.split('/');
			
			for (var i = 0; i < tokens.length; i++)
			{
				(function(index)
				{
					mxUtils.write(pathInfo, ' / ');
					pathInfo.appendChild(createLink(tokens[index], mxUtils.bind(this, function()
					{
						path = tokens.slice(0, index + 1).join('/');
						selectFile();
					})));
				})(i);
			}
		}
		
		div.appendChild(pathInfo);
	});
	
	var selectFile = mxUtils.bind(this, function()
	{
		var req = new mxXmlRequest(this.baseUrl + '/repos/' + org + '/' + repo +
				'/contents/' + path + '?ref=' + encodeURIComponent(ref), null, 'GET');
		dlg.okButton.removeAttribute('disabled');
		div.innerHTML = '';
		this.ui.spinner.spin(div, mxResources.get('loading'));
		
		this.executeRequest(req, mxUtils.bind(this, function(req)
		{
			updatePathInfo();
			this.ui.spinner.stop();
			var files = JSON.parse(req.getText());
			div.appendChild(createLink('../ [Up]', mxUtils.bind(this, function()
			{
				if (path == '')
				{
					path = null;
					selectRepo();
				}
				else
				{
					var tokens = path.split('/');
					path = tokens.slice(0, tokens.length - 1).join('/');
					selectFile();
				}
			})));
			mxUtils.br(div);

			if (files == null || files.length == 0)
			{
				mxUtils.write(div, mxResources.get('noFiles'));
			}
			else
			{
				var listFiles = mxUtils.bind(this, function(showFolders)
				{
					for (var i = 0; i < files.length; i++)
					{
						(mxUtils.bind(this, function(file)
						{
							if (showFolders == (file.type == 'dir'))
							{
								div.appendChild(createLink(file.name + ((file.type == 'dir') ? '/' : ''), mxUtils.bind(this, function()
								{
									if (file.type == 'dir')
									{
										path = file.path;
										selectFile();
									}
									else if (showFiles && file.type == 'file')
									{
										this.ui.hideDialog();
										fn(org + '/' + repo + '/' + ref + '/' + file.path);
									}
								})));
								mxUtils.br(div);
							}
						}))(files[i]);
					}
				});
				
				listFiles(true);
				
				if (showFiles)
				{
					listFiles(false);
				}
			}
		}), mxUtils.bind(this, function(err)
		{
			this.ui.spinner.stop();
			updatePathInfo(true);
			this.ui.handleError(err);
		}));
	});
	
	var selectRef = mxUtils.bind(this, function()
	{
		var req = new mxXmlRequest(this.baseUrl + '/repos/' + org + '/' + repo + '/branches', null, 'GET');
		dlg.okButton.setAttribute('disabled', 'disabled');
		div.innerHTML = '';
		this.ui.spinner.spin(div, mxResources.get('loading'));
		
		this.executeRequest(req, mxUtils.bind(this, function(req)
		{
			this.ui.spinner.stop();
			updatePathInfo(true);
			var branches = JSON.parse(req.getText());
			
			div.appendChild(createLink('../ [Up]', mxUtils.bind(this, function()
			{
				path = null;
				selectRepo();
			})));
			mxUtils.br(div);
			
			if (branches == null || branches.length == 0)
			{
				mxUtils.write(div, mxResources.get('noFiles'));
			}
			else
			{
				for (var i = 0; i < branches.length; i++)
				{
					(mxUtils.bind(this, function(branch)
					{
						div.appendChild(createLink(branch.name, mxUtils.bind(this, function()
						{
							ref = branch.name;
							path = '';
							selectFile();
						})));
						mxUtils.br(div);
					}))(branches[i]);
				}
			}
		}), mxUtils.bind(this, function(err)
		{
			this.ui.spinner.stop();
			updatePathInfo(true);
			this.ui.handleError(err);
		}));
	});
	
	var selectRepo = mxUtils.bind(this, function()
	{
		var req = new mxXmlRequest(this.baseUrl + '/user/repos', null, 'GET');
		dlg.okButton.setAttribute('disabled', 'disabled');
		div.innerHTML = '';
		this.ui.spinner.spin(div, mxResources.get('loading'));
		
		this.executeRequest(req, mxUtils.bind(this, function(req)
		{
			this.ui.spinner.stop();
			var repos = JSON.parse(req.getText());
			
			if (repos == null || repos.length == 0)
			{
				mxUtils.write(div, mxResources.get('noFiles'));
			}
			else
			{
				for (var i = 0; i < repos.length; i++)
				{
					(mxUtils.bind(this, function(repository)
					{
						div.appendChild(createLink(repository.full_name, mxUtils.bind(this, function()
						{
							org = repository.owner.login;
							repo = repository.name;
							ref = repository.default_branch;
							path = '';
	
							selectFile();
						})));
						mxUtils.br(div);
					}))(repos[i]);
				}
			}
		}), mxUtils.bind(this, function(err)
		{
			this.ui.spinner.stop();
			this.ui.handleError(err);
		}));
	});
	
	selectRepo();
};

/**
 * Checks if the client is authorized and calls the next step.
 */
GitHubClient.prototype.logout = function()
{
	this.setUser(null);
	this.clearPersistentToken();
	this.token = null;
};
